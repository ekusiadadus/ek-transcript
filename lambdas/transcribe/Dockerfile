FROM public.ecr.aws/lambda/python:3.12

# Install system dependencies (gcc-c++ required for building native packages)
# Python 3.12 uses AL2023 which has dnf package manager
RUN dnf install -y libsndfile gcc-c++ && dnf clean all

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy function code
COPY lambda_function.py .

CMD ["lambda_function.lambda_handler"]
