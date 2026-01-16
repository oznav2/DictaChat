import multiprocessing
import multiprocessing.connection
import multiprocessing.synchronize
import os
from dataclasses import dataclass
from multiprocessing.sharedctypes import Synchronized
from typing import Any, Dict, List

import numpy as np
from llama_cpp import Llama

from data.workers.base_worker import BaseWorker
from domain.exceptions.worker_not_running_error import WorkerNotRunningError


@dataclass
class BgeM3EmbeddingConfig:
    device: str
    model_name: str
    log_level: str
    use_fp16: bool


@dataclass
class EmbeddingRequest:
    texts: List[str]
    include_dense: bool
    include_sparse: bool
    include_colbert: bool


@dataclass
class EmbeddingResult:
    embeddings: List[Dict[str, Any]]


class BgeM3EmbeddingWorker(
    BaseWorker[  # type: ignore
        EmbeddingRequest,
        EmbeddingResult,
        BgeM3EmbeddingConfig,
        Llama,
    ],
):
    def create_embeddings(self, request: EmbeddingRequest) -> EmbeddingResult:
        if not self.is_alive():
            raise WorkerNotRunningError()

        self._pipe_parent.send(("create_embeddings", request))
        result = self._pipe_parent.recv()

        if isinstance(result, Exception):
            raise result

        return result  # type: ignore

    def initialize_shared_object(
        self,
        config: BgeM3EmbeddingConfig,
    ) -> Llama:
        # Initialize llama.cpp model
        # Note: model_name in config should now point to a GGUF file path
        n_ctx = int(os.getenv("EMBEDDINGS_MODEL_CTX_SIZE", "8192"))
        n_batch = int(os.getenv("EMBEDDINGS_MODEL_BATCH_SIZE", "512"))
        n_ubatch = int(os.getenv("EMBEDDINGS_MODEL_UBATCH_SIZE", "128"))
        n_gpu_layers = int(os.getenv("EMBEDDINGS_MODEL_N_GPU_LAYERS", "-1"))
        main_gpu = int(os.getenv("EMBEDDINGS_MODEL_MAIN_GPU", "0"))
        n_threads = int(os.getenv("EMBEDDINGS_MODEL_THREADS", "8"))

        model = Llama(
            model_path=config.model_name,
            n_gpu_layers=n_gpu_layers,
            main_gpu=main_gpu,
            n_ctx=n_ctx,
            n_batch=n_batch,
            n_ubatch=n_ubatch,
            n_threads=n_threads,
            embedding=True,
            verbose=False
        )

        return model

    def handle_command(
        self,
        command: str,
        args: EmbeddingRequest,
        shared_object: Llama,
        config: BgeM3EmbeddingConfig,
        pipe: multiprocessing.connection.Connection,
        is_processing: Synchronized,  # type: ignore
        processing_lock: multiprocessing.synchronize.Lock,
    ) -> None:
        if command == "create_embeddings":
            try:
                with processing_lock:
                    is_processing.value = True

                request = args
                model = shared_object

                # Check for unsupported features
                if request.include_sparse or request.include_colbert:
                    # We can log this if we had the logger here, but standard print will show in docker logs
                    print("WARNING: Sparse and ColBERT embeddings are not supported with GGUF/llama.cpp backend. Returning dense only.")

                text_embeddings = []

                for text in request.texts:
                    text_embedding: Dict[str, Any] = {"text": text}
                    
                    if request.include_dense:
                        response = model.create_embedding(text)
                        dense_vec = response["data"][0]["embedding"]
                        text_embedding["dense"] = dense_vec

                    text_embeddings.append(text_embedding)

                result = EmbeddingResult(embeddings=text_embeddings)

                pipe.send(result)

            except Exception as e:
                pipe.send(e)
            finally:
                with processing_lock:
                    is_processing.value = False

    def get_worker_name(self) -> str:
        return type(self).__name__
