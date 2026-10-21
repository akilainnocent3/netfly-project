class MessagingError(Exception):
    """A message couldn't be sent. `message` is safe to show to staff; never contains secrets."""

    def __init__(self, message: str, code: str = "send_failed"):
        super().__init__(message)
        self.message = message
        self.code = code
