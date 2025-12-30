import llama_cpp
print(dir(llama_cpp))
try:
    print(f"LLAMA_POOLING_TYPE_RANK: {llama_cpp.LLAMA_POOLING_TYPE_RANK}")
except AttributeError:
    print("LLAMA_POOLING_TYPE_RANK not found directly")

try:
    print(f"LLAMA_POOLING_TYPE_RANK in llama_cpp.llama_cpp: {llama_cpp.llama_cpp.LLAMA_POOLING_TYPE_RANK}")
except AttributeError:
    print("LLAMA_POOLING_TYPE_RANK not found in llama_cpp.llama_cpp")
