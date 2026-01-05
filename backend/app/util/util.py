def read_api_key() -> str:
  key = ""
  with open("private/key.txt", 'rt') as f:
    key = f.read()
  return key