FROM public.ecr.aws/lambda/python:3.12

# Install ffmpeg using dnf (AL2023)
RUN dnf install -y tar xz && \
    curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o /tmp/ffmpeg.tar.xz && \
    tar xf /tmp/ffmpeg.tar.xz -C /tmp && \
    mv /tmp/ffmpeg-*-amd64-static/ffmpeg /usr/local/bin/ && \
    mv /tmp/ffmpeg-*-amd64-static/ffprobe /usr/local/bin/ && \
    rm -rf /tmp/ffmpeg* && \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe && \
    dnf clean all

ENV PATH="/usr/local/bin:${PATH}"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY lambda_function.py .
COPY progress.py .
RUN chmod 644 lambda_function.py progress.py

CMD ["lambda_function.lambda_handler"]
