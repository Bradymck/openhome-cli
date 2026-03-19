import re
from src.agent.capability import MatchingCapability
from src.main import AgentWorker
from src.agent.capability_worker import CapabilityWorker


class VolumeControl(MatchingCapability):
    worker: AgentWorker = None
    capability_worker: CapabilityWorker = None

    @classmethod
    def register_capability(cls) -> "MatchingCapability":
        # {{register_capability}}
        pass

    def call(self, worker: AgentWorker):
        self.worker = worker
        self.capability_worker = CapabilityWorker(self.worker)
        self.worker.session_tasks.create(self.run())

    async def run(self):
        reply = await self.capability_worker.run_io_loop(
            "What would you like? I can raise, lower, set, mute, or max the volume."
        )
        text = reply.strip().lower()

        # Parse intent from natural language
        if any(w in text for w in ["max", "full", "loudest", "all the way up"]):
            self.capability_worker.send_devkit_action({
                "type": "volume",
                "action": "set",
                "value": 100,
            })
            await self.capability_worker.speak("Volume set to maximum.")

        elif any(w in text for w in ["mute", "silent", "quiet", "shut up", "zero"]):
            self.capability_worker.send_devkit_action({
                "type": "volume",
                "action": "set",
                "value": 0,
            })
            await self.capability_worker.speak("Muted.")

        elif any(w in text for w in ["up", "raise", "higher", "louder", "increase"]):
            self.capability_worker.send_devkit_action({
                "type": "volume",
                "action": "up",
                "step": 10,
            })
            await self.capability_worker.speak("Turned it up.")

        elif any(w in text for w in ["down", "lower", "softer", "quieter", "decrease"]):
            self.capability_worker.send_devkit_action({
                "type": "volume",
                "action": "down",
                "step": 10,
            })
            await self.capability_worker.speak("Turned it down.")

        else:
            # Try to parse a number like "set to 50" or "50 percent"
            match = re.search(r"(\d+)", text)
            if match:
                level = min(100, max(0, int(match.group(1))))
                self.capability_worker.send_devkit_action({
                    "type": "volume",
                    "action": "set",
                    "value": level,
                })
                await self.capability_worker.speak(f"Volume set to {level} percent.")
            else:
                await self.capability_worker.speak(
                    "I didn't catch that. Try saying raise, lower, mute, max, or a number like 50."
                )

        self.capability_worker.resume_normal_flow()
