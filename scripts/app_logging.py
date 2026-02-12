import logging
import threading
import queue

class UILogHandler(logging.Handler):
    """
    A custom logging handler that sends logs to a queue
    so the UI can consume them thread-safely.
    """
    def __init__(self, log_queue):
        super().__init__()
        self.log_queue = log_queue
        # Set a formatter that includes Module, Func, Line
        self.setFormatter(logging.Formatter(
            '%(asctime)s | %(levelname)-8s | %(module)s.%(funcName)s:%(lineno)d | %(message)s',
            datefmt='%H:%M:%S'
        ))

    def emit(self, record):
        try:
            msg = self.format(record)
            self.log_queue.put(msg)
        except Exception:
            self.handleError(record)

def setup_logger(queue=None):
    """Configures the root logger to use the UILogHandler."""
    logger = logging.getLogger()
    logger.setLevel(logging.DEBUG)  # Capture everything

    # Remove existing handlers to avoid duplicates if re-initialized
    for h in logger.handlers[:]:
        logger.removeHandler(h)

    if queue:
        handler = UILogHandler(queue)
        logger.addHandler(handler)

    return logger
