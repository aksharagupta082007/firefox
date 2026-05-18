"""
AURORA TECH — Voice Processing Service
Integrates Faster-Whisper for STT and Piper for TTS.
"""
import os
import logging
import asyncio
import tempfile
from typing import Optional
try:
    from faster_whisper import WhisperModel
except ImportError:
    WhisperModel = None

logger = logging.getLogger("aurora.voice")

class VoiceProcessor:
    def __init__(self):
        self.model_size = "base"
        self.stt_model = None
        self.tts_command = "piper" # Assumes piper is in PATH
        
    def init_models(self):
        """Lazy initialization of STT model."""
        if WhisperModel and not self.stt_model:
            try:
                self.stt_model = WhisperModel(self.model_size, device="cpu", compute_type="int8")
                logger.info(f"✅ STT Model ({self.model_size}) initialized.")
            except Exception as e:
                logger.error(f"❌ Failed to init STT model: {e}")

    async def transcribe_stream(self, audio_bytes: bytes) -> str:
        """
        Transcribes a chunk of audio bytes.
        In production, this would handle a buffer for streaming STT.
        """
        if not self.stt_model:
            self.init_models()
        
        if not self.stt_model:
            return "[Voice processing unavailable]"

        temp_file = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as f:
                f.write(audio_bytes)
                temp_file = f.name

            segments, info = self.stt_model.transcribe(temp_file, beam_size=5)
            text = " ".join([segment.text for segment in segments])
            return text.strip()
        finally:
            if temp_file and os.path.exists(temp_file):
                os.remove(temp_file)

    async def generate_speech(self, text: str, output_path: str):
        """
        Generates TTS audio using Piper.
        Example: echo "text" | piper --model model.onnx --output_file output.wav
        """
        logger.info(f"Generating speech for: {text[:30]}...")
        # This is a shell-out for Piper (production standard for low latency)
        command = f'echo "{text}" | {self.tts_command} --model en_US-lessac-medium.onnx --output_file {output_path}'
        process = await asyncio.create_subprocess_shell(command)
        await process.wait()
        return output_path

voice_processor = VoiceProcessor()
