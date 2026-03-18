import requests
from src.agent.capability import MatchingCapability
from src.main import AgentWorker
from src.agent.capability_worker import CapabilityWorker


class Noot(MatchingCapability):
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
        api_key = self.capability_worker.get_single_key("api_key")
        response = requests.get(
            "https://api.example.com/data",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10,
        )
        data = response.json()
        await self.capability_worker.speak(f"Here's what I found: {data.get('result', 'nothing')}")
        self.capability_worker.resume_normal_flow()
