FROM public.ecr.aws/lambda/python:3.11-al2023

# Install system dependencies (gcc-c++ required for building native packages)
RUN dnf install -y libsndfile gcc-c++ && dnf clean all

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy function code
COPY lambda_function.py .

# Set the CMD to handler
CMD ["lambda_function.lambda_handler"]
