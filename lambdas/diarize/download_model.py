"""Download pyannote model at build time."""
import os
import torch

# PyTorch 2.6+ requires explicit safe_globals for pyannote models
# Add all pyannote classes that might be pickled
from pyannote.audio.core.task import Specifications, Problem, Resolution
from pyannote.audio.core.model import Introspection

torch.serialization.add_safe_globals([Specifications, Problem, Resolution, Introspection])

from pyannote.audio import Pipeline

hf_token = os.environ.get("HF_TOKEN", "")
Pipeline.from_pretrained("pyannote/speaker-diarization-community-1", token=hf_token)
print("Model downloaded successfully")
