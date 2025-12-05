Lambda + Step Functions + S3 + Whisper + ffmpeg による低コスト話者分離書き起こしパイプラインの調査
背景と目的

長時間の録画動画（最大8時間）から 話者分離付き文字起こし を行い、そのテキストを LLM で分析するパイプラインを構築する。AWS サーバーレス（Lambda、StepFunctions、S3）を用いて徹底的に低コストで運用したい。また、動画から音声を抽出する際には ffmpeg を用い、オープンソースの Whisper（CTranslate2 ベースの faster‑whisper）と Pyannote.audio による話者分離（diarization）を採用する。LLM には Amazon Bedrock や OpenAI API 等を利用できるが、ここでは Amazon Bedrock の使用例も示す。以下では最新情報に基づき、アーキテクチャ、必要なライブラリ、実装方針、サンプルコードを詳述する。

1. 参考文献・関連情報

AWS サンプルソリューション「Conversation Intelligence using AI/ML on AWS」の README では、話者分離に Pyannote.audio、文字起こしに faster‑whisper を使う構成を紹介している。Pyannote は PyTorch ベースで、事前学習済みモデルが提供されており HuggingFace トークンでアクセスできる
raw.githubusercontent.com
。faster‑whisper は Whisper を CTranslate2 上で再実装した高速版で、元の Whisper よりも最大4倍高速で少ないメモリで動作する
raw.githubusercontent.com
。

Pyannote のモデルカードでは、Pipeline.from_pretrained('pyannote/speaker-diarization-3.1') でパイプラインを初期化し diarization = pipeline('audio.wav') で話者分離が実行できる例が掲載されている
huggingface.co
。パイプラインはデフォルトで CPU 動作だが pipeline.to(torch.device('cuda')) で GPU を利用できる
huggingface.co
。

ffmpeg-python のチュートリアルでは、ffmpeg.input('input.mp4').output('audio.mp3').run() で動画から音声ファイルを抽出できる例が紹介されている
bannerbear.com
。acodec オプションでコーデックを指定することも可能である
bannerbear.com
。

AWS Transcribe の 2025 年の料金では、標準転記が 1分あたり 0.024 USD、話者識別などの追加機能は別料金である
brasstranscripts.com
。長時間の音声を多数処理すると費用が膨らむため、オープンソースモデルを使って自前で処理する方がコストを抑えられる。

GitHub のディスカッションでは、Lambda で ffmpeg を使用する際は ffmpeg をバイナリとして Lambda レイヤーに含め /opt/bin/ffmpeg に配置し、PATH に /opt/bin を追加しておく必要があると指摘されている
github.com
。

2. 全体アーキテクチャ

以下は Step Functions を中心としたサーバーレスな処理フローの例である。並列処理やリトライ設定により長時間の動画でも効率良く処理できる。

アップロード – ユーザーが S3 バケットに動画をアップロードすると、S3 イベント通知が Step Functions の State Machine をトリガーする。

音声抽出 (Lambda – ExtractAudio) – Lambda 関数で ffmpeg を使い、動画から音声（16kHz・モノラル）を抽出する。抽出した音声ファイルは S3 に保存する。

話者分離 (Lambda/Fargate – Diarize) – Pyannote.audio パイプラインを実行し、音声ファイルから話者ごとの区間を推定（RTTM ファイル等）する。処理が重いため Lambda の 大型コンテナイメージ（メモリ10GB、最大15分実行）や Fargate を利用する。必要に応じて GPU 環境を用意する。結果は S3 に保存。

音声分割 (Lambda – SplitBySpeaker) – RTTM に基づき音声を話者ごとに切り出す。pydub や ffmpeg で区間抽出し、各話者セグメントを S3 に保存する。

文字起こし (Lambda/Fargate – Transcribe) – Map State を使ってセグメントごとに並列処理し、faster‑whisper でテキストに変換する。結果は話者 ID, 開始/終了時刻とともに格納し、1本の JSON/CSV にまとめて S3 へ保存する。コストを抑えるため Distil-Whisper や medium モデルを選択する。

LLM 分析 (Lambda – LLMAnalysis) – ユーザーが指定するプロンプトとトランスクリプトを Bedrock API に送信して要約や感情分析・質問応答を行い、結果を S3 に保存する。

完了通知 – S3 に結果が保存されたことを EventBridge で通知し、DynamoDB への記録やメール通知を行う。必要に応じて静的ウェブUIや API Gateway から取得できるようにする。

この構成では処理ステップを完全にサーバーレス化し、利用した分だけ課金される。重い処理は Fargate や EC2 を使うことで拡張も可能である。Step Functions の Map 状態を活用すると大量のセグメントを同時に処理できるため、全体の時間とコストを削減できる。

3. Lambda 関数の実装方針
3.1 音声抽出 (ExtractAudio)

Lambda コンテナイメージに ffmpeg バイナリを含める。GitHub の議論によると ffmpeg をレイヤーに含め /opt/bin/ffmpeg に配置し、PATH に追加する必要がある
github.com
。

Python の ffmpeg‑python ライブラリ
 を使うと簡潔に書ける。下記のコード例のように、入力 MP4 から音声を MP3/WAV に変換する
bannerbear.com
。

import boto3
import ffmpeg
import os

s3 = boto3.client('s3')

def lambda_handler(event, context):
    # S3 イベントから入力ファイルを取得
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = event['Records'][0]['s3']['object']['key']
    local_video = '/tmp/input.mp4'
    local_audio = '/tmp/audio.wav'
    
    # 動画をダウンロード
    s3.download_file(bucket, key, local_video)
    
    # ffmpeg で音声抽出（16kHz、モノラル）
    (
        ffmpeg.input(local_video)
              .output(local_audio, ac=1, ar='16k')
              .run()
    )
    
    # 音声ファイルを S3 にアップロード
    audio_key = key.rsplit('.', 1)[0] + '.wav'
    s3.upload_file(local_audio, bucket, f"processed/{audio_key}")
    
    return {'audio_key': audio_key}

3.2 話者分離 (Diarize)

Pyannote.audio のパイプラインを使う。huggingface_hub で取得するため、環境変数に HuggingFace アクセストークンを設定し、事前にモデル利用規約を承諾しておく。
huggingface.co
 に示すように Pipeline.from_pretrained() で初期化し pipeline(audio) で実行する。

メモリ使用量が多いため Lambda のコンテナイメージはメモリ 10GB 以上でビルドするか、AWS Fargate のタスクとして実装し Step Functions から呼び出す。

出力は RTTM（開始/終了秒・話者ID）や JSON にする。

from pyannote.audio import Pipeline
import torch
import boto3, json

# 環境変数に HUGGING_FACE_TOKEN を設定しておく
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1",
    use_auth_token=os.environ['HF_TOKEN']
)
# オプション：GPU が使える環境では pipeline.to(torch.device('cuda'))

s3 = boto3.client('s3')

def lambda_handler(event, context):
    bucket = event['bucket']
    key = event['audio_key']
    local_audio = '/tmp/audio.wav'
    s3.download_file(bucket, key, local_audio)
    
    diarization = pipeline(local_audio)
    # RTTM ファイルを作成
    rttm_path = '/tmp/output.rttm'
    with open(rttm_path, 'w') as f:
        diarization.write_rttm(f)
    
    output_key = key.replace('.wav', '.rttm')
    s3.upload_file(rttm_path, bucket, f"processed/{output_key}")
    
    # JSON 形式でも保存
    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append({
            'start': turn.start,
            'end': turn.end,
            'speaker': speaker
        })
    json_key = key.replace('.wav', '_segments.json')
    s3.put_object(Bucket=bucket, Key=f"processed/{json_key}",
                  Body=json.dumps(segments))
    
    return {'segments_key': json_key}

3.3 音声分割 (SplitBySpeaker)

RTTM または JSON で得た各話者の区間に基づき音声ファイルを切り出す。ffmpeg を呼び出すか pydub を使う。

Lambda で大量ファイルを生成するとタイムアウトする恐れがあるため、Step Functions の Map ステートを用いてセグメントごとに並列処理する。

from pydub import AudioSegment
import json, boto3, os

s3 = boto3.client('s3')

def lambda_handler(event, context):
    bucket = event['bucket']
    audio_key = event['audio_key']
    seg_key = event['segments_key']
    
    # 音声とセグメント情報をダウンロード
    local_audio = '/tmp/audio.wav'
    local_json = '/tmp/segments.json'
    s3.download_file(bucket, audio_key, local_audio)
    s3.download_file(bucket, seg_key, local_json)
    audio = AudioSegment.from_wav(local_audio)
    segments = json.loads(open(local_json).read())
    
    outputs = []
    for i, seg in enumerate(segments):
        start_ms = int(seg['start'] * 1000)
        end_ms = int(seg['end'] * 1000)
        speaker = seg['speaker']
        clip = audio[start_ms:end_ms]
        out_path = f"/tmp/clip_{i}.wav"
        clip.export(out_path, format='wav')
        out_key = f"processed/segments/{i}_{speaker}.wav"
        s3.upload_file(out_path, bucket, out_key)
        outputs.append({'speaker': speaker, 'key': out_key})
    return {'segment_files': outputs}

3.4 文字起こし (Transcribe)

faster‑whisper を使用する。これは Whisper モデルを CTranslate2 上で高速化したもので、メモリ消費が少ない
raw.githubusercontent.com
。pip install faster-whisper でインストール可能。model = WhisperModel('medium', device='cpu', compute_type='int8') のように指定する。

入力音声が長い場合も対応できるが、Lambda のタイムアウト制限（最大15分）に注意。必要に応じて小さいモデル（distil-medium 等）や Fargate を使用。

Map ステートでセグメントごとに並列実行する。

from faster_whisper import WhisperModel
import boto3, json, os

s3 = boto3.client('s3')
model = WhisperModel(
    model_size="medium",
    device="cpu",         # GPU 環境があれば "cuda"
    compute_type="int8"
)


def transcribe_segment(bucket, key, speaker):
    local_path = '/tmp/segment.wav'
    s3.download_file(bucket, key, local_path)
    segments, _ = model.transcribe(local_path, beam_size=5)
    text = "".join([seg.text for seg in segments])
    return {'speaker': speaker, 'text': text}


def lambda_handler(event, context):
    bucket = event['bucket']
    segment_files = event['segment_files']
    results = []
    for seg in segment_files:
        res = transcribe_segment(bucket, seg['key'], seg['speaker'])
        results.append(res)
    # 音声ごとに speaker + text をまとめて出力
    transcript_key = event['audio_key'].replace('.wav', '_transcript.json')
    s3.put_object(Bucket=bucket, Key=f"processed/{transcript_key}",
                  Body=json.dumps(results, ensure_ascii=False))
    return {'transcript_key': transcript_key}

3.5 LLM 分析 (LLMAnalysis)

生成 AI の利用はユーザーの要件に合わせて決める。Amazon Bedrock で OpenAI Whisper Foundation Model を使用したり、Claude 2/3 や Llama 等の LLM を選択できる。Bedrock API の InvokeModel を Lambda から呼び出すとよい。

ユーザー入力（質問や要約の指示）をプロンプトに組み込み、テキストと一緒に LLM に送信する。Bedrock の利用には事前のモデル利用申請が必要である
raw.githubusercontent.com
。

例として、トランスクリプトを要約し主要ポイントとアクションアイテムを抽出するプロンプトを送るコードを示す。

import boto3, json, os

bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')

def lambda_handler(event, context):
    bucket = event['bucket']
    transcript_key = event['transcript_key']
    prompt_input = event['prompt']  # ユーザーからの分析指示
    
    transcript = json.loads(
        s3.get_object(Bucket=bucket, Key=transcript_key)['Body'].read()
    )
    full_text = "\n".join([f"[{t['speaker']}] {t['text']}" for t in transcript])
    
    prompt = (
        f"あなたはカスタマーサポートの会話分析AIです。次の文字起こしを読み、" \
        f"{prompt_input}。\n"  # 例: "要約を作成し、主な問題点とアクションアイテムを箇条書きで抽出してください"
        f"\n文字起こし:\n{full_text}"
    )

    response = bedrock.invoke_model(
        modelId=os.environ['BEDROCK_MODEL_ID'],
        contentType="application/json",
        accept="application/json",
        body=json.dumps({"prompt": prompt, "max_tokens_to_sample": 1024})
    )
    result_text = json.loads(response['body'].read().decode())['completion']
    result_key = transcript_key.replace('_transcript.json', '_analysis.txt')
    s3.put_object(Bucket=bucket, Key=f"processed/{result_key}", Body=result_text)
    return {'analysis_key': result_key}

4. Step Functions State Machine 定義例

以下は JSON 形式の概略である。各ステップには Lambda または Fargate タスクを割り当てる。音声セグメントごとに Map ステートで処理することで並列化する。

{
  "StartAt": "ExtractAudio",
  "States": {
    "ExtractAudio": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:ExtractAudio",
      "Next": "Diarize"
    },
    "Diarize": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:Diarize",
      "Next": "SplitBySpeaker"
    },
    "SplitBySpeaker": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:SplitBySpeaker",
      "Next": "TranscribeSegments"
    },
    "TranscribeSegments": {
      "Type": "Map",
      "ItemsPath": "$.segment_files",
      "MaxConcurrency": 5,
      "Iterator": {
        "StartAt": "Transcribe",
        "States": {
          "Transcribe": {
            "Type": "Task",
            "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:Transcribe",
            "End": true
          }
        }
      },
      "Next": "LLMAnalysis"
    },
    "LLMAnalysis": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:LLMAnalysis",
      "End": true
    }
  }
}


各ステートにリトライやタイムアウトを設定して障害に耐えるようにする。

大きな動画の場合は処理が長時間に及ぶため、Step Functions の 標準ワークフロー（最大 1年実行）を選ぶ。

5. 必要なライブラリ・パッケージ
用途	ライブラリ/サービス	概要
動画から音声抽出	ffmpeg / ffmpeg‑python	コマンドラインツール。Lambda ではバイナリをレイヤーに含め /opt/bin/ffmpeg を PATH に追加する。Python からは pip install ffmpeg-python でラッパーを利用。音声抽出コード例は
bannerbear.com
に示す通り。
話者分離	pyannote.audio	PyTorch ベースの話者分離ライブラリ。Pipeline.from_pretrained('pyannote/speaker-diarization-3.1') で呼び出し、pipeline(audio) で解析する
huggingface.co
。HuggingFace アクセストークンが必要。
文字起こし	faster‑whisper	Whisper を CTranslate2 上に実装した高速モデル。WhisperModel(model_size, device, compute_type) で初期化して model.transcribe() を呼ぶ
raw.githubusercontent.com
。モデルサイズは small, medium, large-v3 などが選べる。GPU 環境なら device='cuda'。
音声編集	pydub	WAV/MP3 などのオーディオファイルを切り出すために使用。各話者区間を簡単に切り出せる。
AWS SDK	boto3	S3 や Bedrock API の呼び出し、Step Functions タスク統合に使用。
LLM API	Amazon Bedrock / OpenAI API	生成 AI で要約や分析を行う。Bedrock を利用する場合は事前にモデルアクセスを設定し、InvokeModel API を呼び出す
raw.githubusercontent.com
。
6. 運用上の考慮点

長時間音声処理とリソース制限：Lambda は最大 15 分／10 GB メモリに制限されるため、8 時間の音声を一度に処理するのは困難である。音声を複数の小さなファイルに分割し、Map ステートで並列処理することで制限を回避する。また、話者分離や文字起こしは Fargate や AWS Batch にオフロードすることも検討する。

コスト最適化：AWS Transcribe のようなマネージドサービスは話者識別が有料オプションである
brasstranscripts.com
。本提案ではオープンソースモデルを利用し、サーバーレス実行によって使用分のみ課金されるようにした。モデルサイズを小さくする（small や distil-*）・実行場所を CPU にするなどでコストを更に下げられる。

精度とモデルサイズのトレードオフ：faster‑whisper のモデルサイズによって精度が変わる。medium や large-v3 は精度が高いがメモリ消費が大きく実行時間も長くなる。処理対象の音声品質に応じて選択する。Pyannote も speaker-diarization-3.1 が CPU で動作可能だが、話者数が多いと精度が下がる場合がある。

HuggingFace トークン管理：Pyannote を使用するには HuggingFace アカウントのトークンを環境変数に設定し、cfg.py などに保存しておく必要がある
raw.githubusercontent.com
。

セキュリティと権限：Lambda 実行ロールには S3 への get/put 権限、Bedrock や Step Functions への実行権限、Secrets Manager から HuggingFace トークンを取得する権限を付与する。S3 バケットは暗号化を有効にし、アクセスを IAM ポリシーで制御する。

まとめ

8時間に及ぶ長時間動画から話者分離付き文字起こしを実現するには、音声の分割と並列処理が鍵となる。AWS Step Functions を用いたサーバーレスアーキテクチャでは、ffmpeg による音声抽出、pyannote.audio による話者分離、faster‑whisper による文字起こしを Lambda/Fargate で順次実行し、結果を S3 に保存する。生成 AI による要約や分析は Amazon Bedrock 等の API で行える。事前に示したサンプルコードとステートマシン定義を基に実装すれば、徹底的にコストを抑えつつ高品質な書き起こしと分析が可能である。
