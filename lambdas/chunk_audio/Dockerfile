FROM public.ecr.aws/lambda/python:3.12

# ffmpeg インストール（静的バイナリ）
RUN dnf install -y tar xz && \
    curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | \
    tar xJ --strip-components=1 -C /usr/local/bin && \
    dnf clean all

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY lambda_function.py .
COPY progress.py .
RUN chmod 644 lambda_function.py progress.py

CMD ["lambda_function.lambda_handler"]
