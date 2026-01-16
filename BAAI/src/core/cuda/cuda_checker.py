from core.logger.logger import Logger


class CudaChecker:
    def __init__(
        self,
        logger: Logger,
    ) -> None:
        self.logger = logger

    def check_cuda_support(self) -> None:
        try:
            import torch  # type: ignore
        except Exception:
            self.logger.info("PyTorch not installed; skipping CUDA availability check.")
            return
        try:
            if torch.cuda.is_available():
                cuda_devices = [torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())]
                self.logger.info(f"CUDA is supported. Available devices: {', '.join(cuda_devices)}")
            else:
                self.logger.info("CUDA is not supported on this device.")
        except Exception as e:
            self.logger.warning(f"CUDA check encountered an error: {e}")
