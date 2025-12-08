FROM public.ecr.aws/lambda/python:3.12

# Install system dependencies (gcc-c++ required for building native packages)
# Python 3.12 uses AL2023 which has dnf package manager
# libsndfile is required for soundfile package to load audio
RUN dnf install -y libsndfile gcc-c++ && dnf clean all

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download pyannote model at build time
ARG HF_TOKEN
ENV HF_HOME=/opt/huggingface
ENV HF_TOKEN=${HF_TOKEN}
COPY download_model.py /tmp/download_model.py
RUN mkdir -p /opt/huggingface && \
    python /tmp/download_model.py && \
    rm /tmp/download_model.py && \
    chmod -R 755 /opt/huggingface

# Copy function code
COPY lambda_function.py .
COPY progress.py .
RUN chmod 644 lambda_function.py progress.py

# Set the CMD to handler
CMD ["lambda_function.lambda_handler"]
