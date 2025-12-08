FROM public.ecr.aws/lambda/python:3.12

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY lambda_function.py .
COPY progress.py .
RUN chmod 644 lambda_function.py progress.py

CMD ["lambda_function.lambda_handler"]
