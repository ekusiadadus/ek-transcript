# ek-transcript Makefile
# Speaker Diarization Transcription Pipeline

.PHONY: help setup install test lint format build deploy clean all check

# デフォルトターゲット
.DEFAULT_GOAL := help

# 色定義
BLUE := \033[34m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
RESET := \033[0m

##@ 一般

help: ## このヘルプメッセージを表示
	@awk 'BEGIN {FS = ":.*##"; printf "\n$(BLUE)Usage:$(RESET)\n  make $(GREEN)<target>$(RESET)\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(GREEN)%-15s$(RESET) %s\n", $$1, $$2 } /^##@/ { printf "\n$(YELLOW)%s$(RESET)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ セットアップ

setup: ## 初期環境セットアップ (uv, node, 依存関係)
	@echo "$(BLUE)==> 環境セットアップを開始...$(RESET)"
	@command -v uv >/dev/null 2>&1 || { echo "$(RED)uv がインストールされていません。https://docs.astral.sh/uv/ を参照$(RESET)"; exit 1; }
	@command -v node >/dev/null 2>&1 || { echo "$(RED)Node.js がインストールされていません$(RESET)"; exit 1; }
	@echo "$(GREEN)✓ uv と Node.js が利用可能$(RESET)"
	$(MAKE) install
	@echo "$(GREEN)==> セットアップ完了!$(RESET)"

install: install-python install-node ## 全ての依存関係をインストール

install-python: ## Python 依存関係をインストール (uv)
	@echo "$(BLUE)==> Python 依存関係をインストール中...$(RESET)"
	uv sync --all-extras
	@echo "$(GREEN)✓ Python 依存関係インストール完了$(RESET)"

install-node: ## Node.js 依存関係をインストール (CDK)
	@echo "$(BLUE)==> Node.js 依存関係をインストール中...$(RESET)"
	cd cdk && npm install
	@echo "$(GREEN)✓ Node.js 依存関係インストール完了$(RESET)"

##@ 開発

test: ## テストを実行
	@echo "$(BLUE)==> テストを実行中...$(RESET)"
	uv run pytest -v
	@echo "$(GREEN)✓ テスト完了$(RESET)"

test-cov: ## カバレッジ付きでテストを実行
	@echo "$(BLUE)==> カバレッジ付きテストを実行中...$(RESET)"
	uv run pytest --cov=lambdas --cov-report=html --cov-report=term
	@echo "$(GREEN)✓ テスト完了 (カバレッジレポート: htmlcov/index.html)$(RESET)"

lint: ## リンター実行 (ruff, mypy)
	@echo "$(BLUE)==> リンターを実行中...$(RESET)"
	uv run ruff check .
	uv run mypy lambdas tests
	@echo "$(GREEN)✓ リント完了$(RESET)"

format: ## コード整形 (ruff format)
	@echo "$(BLUE)==> コードを整形中...$(RESET)"
	uv run ruff format .
	uv run ruff check --fix .
	@echo "$(GREEN)✓ 整形完了$(RESET)"

check: lint test ## リントとテストを実行

##@ ビルド

build: build-cdk ## 全てをビルド

build-cdk: ## CDK をビルド
	@echo "$(BLUE)==> CDK をビルド中...$(RESET)"
	cd cdk && npm run build
	@echo "$(GREEN)✓ CDK ビルド完了$(RESET)"

synth: build-cdk ## CDK テンプレートを生成
	@echo "$(BLUE)==> CDK テンプレートを生成中...$(RESET)"
	cd cdk && npx cdk synth
	@echo "$(GREEN)✓ テンプレート生成完了$(RESET)"

##@ デプロイ

deploy: build-cdk ## AWS にデプロイ
	@echo "$(BLUE)==> AWS にデプロイ中...$(RESET)"
	cd cdk && npx cdk deploy --all --require-approval never
	@echo "$(GREEN)✓ デプロイ完了$(RESET)"

deploy-approval: build-cdk ## AWS にデプロイ (承認あり)
	@echo "$(BLUE)==> AWS にデプロイ中 (承認あり)...$(RESET)"
	cd cdk && npx cdk deploy --all
	@echo "$(GREEN)✓ デプロイ完了$(RESET)"

diff: build-cdk ## デプロイ差分を表示
	@echo "$(BLUE)==> デプロイ差分を確認中...$(RESET)"
	cd cdk && npx cdk diff

destroy: ## AWS リソースを削除
	@echo "$(RED)==> AWS リソースを削除中...$(RESET)"
	cd cdk && npx cdk destroy --all
	@echo "$(YELLOW)✓ リソース削除完了$(RESET)"

##@ クリーンアップ

clean: clean-python clean-node clean-cache ## 全てをクリーンアップ

clean-python: ## Python キャッシュをクリーンアップ
	@echo "$(BLUE)==> Python キャッシュを削除中...$(RESET)"
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "htmlcov" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type f -name ".coverage" -delete 2>/dev/null || true
	@echo "$(GREEN)✓ Python キャッシュ削除完了$(RESET)"

clean-node: ## Node.js ビルド成果物をクリーンアップ
	@echo "$(BLUE)==> Node.js ビルド成果物を削除中...$(RESET)"
	rm -rf cdk/*.js cdk/*.d.ts 2>/dev/null || true
	rm -rf cdk/lib/*.js cdk/lib/*.d.ts 2>/dev/null || true
	rm -rf cdk/lib/**/*.js cdk/lib/**/*.d.ts 2>/dev/null || true
	rm -rf cdk/cdk.out 2>/dev/null || true
	@echo "$(GREEN)✓ Node.js ビルド成果物削除完了$(RESET)"

clean-cache: ## その他キャッシュをクリーンアップ
	@echo "$(BLUE)==> その他キャッシュを削除中...$(RESET)"
	rm -rf .pytest_cache 2>/dev/null || true
	rm -rf /tmp/seg_*.wav /tmp/audio.wav /tmp/input.mp4 2>/dev/null || true
	@echo "$(GREEN)✓ キャッシュ削除完了$(RESET)"

##@ ユーティリティ

version: ## バージョン情報を表示
	@echo "$(BLUE)==> バージョン情報$(RESET)"
	@echo "Python: $$(python --version)"
	@echo "uv: $$(uv --version)"
	@echo "Node: $$(node --version)"
	@echo "npm: $$(npm --version)"
	@echo "CDK: $$(cd cdk && npx cdk --version)"

env-check: ## 環境変数をチェック
	@echo "$(BLUE)==> 環境変数チェック$(RESET)"
	@if [ -f .env ]; then \
		echo "$(GREEN)✓ .env ファイルが存在します$(RESET)"; \
	else \
		echo "$(YELLOW)⚠ .env ファイルが見つかりません$(RESET)"; \
		echo "  .env.example をコピーして設定してください"; \
	fi
	@if [ -n "$$AWS_PROFILE" ] || [ -n "$$AWS_ACCESS_KEY_ID" ]; then \
		echo "$(GREEN)✓ AWS 認証情報が設定されています$(RESET)"; \
	else \
		echo "$(YELLOW)⚠ AWS 認証情報が設定されていません$(RESET)"; \
	fi

all: check build ## 全てのチェックとビルドを実行
