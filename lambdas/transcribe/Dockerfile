FROM public.ecr.aws/lambda/python:3.12

# Install system dependencies (gcc-c++ required for building native packages)
# Python 3.12 uses AL2023 which has dnf package manager
RUN dnf install -y libsndfile gcc-c++ && dnf clean all

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download faster-whisper model at build time
ENV WHISPER_MODEL_DIR=/opt/whisper-models
ARG WHISPER_MODEL=medium
RUN mkdir -p ${WHISPER_MODEL_DIR} && \
    python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8', download_root='${WHISPER_MODEL_DIR}')" && \
    chmod -R 755 ${WHISPER_MODEL_DIR}

# Copy function code
COPY lambda_function.py .
COPY progress.py .
RUN chmod 644 lambda_function.py progress.py

CMD ["lambda_function.lambda_handler"]
