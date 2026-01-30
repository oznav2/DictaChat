import re

MONGO_WRAPPER_REGEX = re.compile(r'\{"t":\{"\$date":"(.*?)"\},?')

line = 'bricksllm-mongo    | {"t":{"$date":"2026-01-21T16:33:51.526+00:00"},"s":"I", "c":"NETWORK", "msg":"Connection accepted"}'
line = re.sub(r'"s":"I",?\s*', '', line)
print(f"After s:I removal: {line}")

line = MONGO_WRAPPER_REGEX.sub(r'\1 ', line)
print(f"After Mongo Wrapper removal: {line}")
