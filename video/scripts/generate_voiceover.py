import asyncio
import json
import os
import edge_tts
from mutagen.mp3 import MP3

VOICE = "en-US-AndrewNeural"
RATE = "+3%"

SCENES = [
    {
        "id": "intro",
        "title": "Meet RelayNest",
        "text": (
            "Welcome to RelayNest — your all-in-one workspace to build, automate, "
            "and manage powerful Telegram bots without writing a single line of code."
        ),
    },
    {
        "id": "dashboard",
        "title": "Overview & Notifications",
        "text": (
            "Start on your live Overview dashboard. Track active bots, incoming messages, "
            "quick shortcuts, and instant notifications from your header bell in one clean view."
        ),
    },
    {
        "id": "telegram",
        "title": "My Bots & Two-Way Sync",
        "text": (
            "Inside My Bots, connect your Telegram bot in seconds. RelayNest syncs your bot "
            "profile automatically, stays in lockstep with Telegram, and records created or deleted bot history."
        ),
    },
    {
        "id": "manageBot",
        "title": "Manage & Edit Bot",
        "text": (
            "Open any bot to edit its name, photo, slash commands, and welcome or fallback replies — "
            "every update syncs smoothly to Telegram with a live test console built right in."
        ),
    },
    {
        "id": "templates",
        "title": "Bot Templates",
        "text": (
            "Want to launch even faster? Pick ready-made templates for Customer Support, "
            "smart FAQs, community welcomes, notifications, and lead capture."
        ),
    },
    {
        "id": "workflow",
        "title": "Visual Automations",
        "text": (
            "Design custom bot flows visually inside Automations. Combine triggers, smart choices, "
            "scheduled updates, and interactive reply buttons, then review every run in Executions."
        ),
    },
    {
        "id": "aiStudio",
        "title": "Models & Playground",
        "text": (
            "Give your bots human-like intelligence in the AI Platform. Browse top models "
            "in the Model Catalog and test real conversations live inside the Model Playground."
        ),
    },
    {
        "id": "aiAgent",
        "title": "Knowledge Base & AI Agents",
        "text": (
            "Upload your PDFs, product guides, and FAQs into the Knowledge Base, then launch "
            "an AI Agent that answers customer questions accurately on Telegram around the clock."
        ),
    },
    {
        "id": "analytics",
        "title": "Analytics, Settings & Plans",
        "text": (
            "Track growth inside Analytics, manage team settings effortlessly, "
            "and choose Free, Pro, or Business plans in dollars or rupees whenever you scale."
        ),
    },
    {
        "id": "integrationsApi",
        "title": "Integrations, API Keys & Swagger UI",
        "text": (
            "Connect Slack, Discord, and signed webhooks in Integrations, generate scoped A P I keys, "
            "test live calls inside interactive Swagger U I, and receive instant notification alerts."
        ),
    },
    {
        "id": "closer",
        "title": "Start Free Today",
        "text": (
            "Everything you need to run Telegram support, workflows, and AI assistants in one place. "
            "Create your first bot free on RelayNest today."
        ),
    },
]


async def synth_scene(scene: dict, out_dir: str) -> dict:
    mp3_path = os.path.join(out_dir, f"vo-{scene['id']}.mp3")
    spoken = scene["text"].replace(" — ", ", ")
    words = []
    audio_chunks = bytearray()

    for attempt in range(4):
        try:
            words = []
            audio_chunks = bytearray()
            communicate = edge_tts.Communicate(spoken, VOICE, rate=RATE, boundary="WordBoundary")
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_chunks.extend(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    start_ms = round(chunk["offset"] / 10_000)
                    dur_ms = round(chunk["duration"] / 10_000)
                    words.append({
                        "text": chunk["text"],
                        "startMs": start_ms,
                        "endMs": start_ms + max(dur_ms, 80),
                    })
            if len(audio_chunks) > 0:
                break
        except Exception as exc:
            if attempt == 3:
                raise exc
            await asyncio.sleep(1.2 * (attempt + 1))

    with open(mp3_path, "wb") as f:
        f.write(audio_chunks)

    for i in range(len(words) - 1):
        if words[i]["endMs"] < words[i + 1]["startMs"] and (words[i + 1]["startMs"] - words[i]["endMs"]) < 140:
            words[i]["endMs"] = words[i + 1]["startMs"]

    info = MP3(mp3_path).info
    duration_ms = round(info.length * 1000)

    return {
        "id": scene["id"],
        "title": scene["title"],
        "text": scene["text"],
        "audioFile": f"audio/vo-{scene['id']}.mp3",
        "durationMs": duration_ms,
        "words": words,
    }


async def main() -> None:
    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "audio"))
    manifest_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src", "data", "vo-manifest.json"))
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(os.path.dirname(manifest_path), exist_ok=True)

    results = []
    for scene in SCENES:
        res = await synth_scene(scene, out_dir)
        print(f"Synthesized {res['id']}: {res['durationMs']}ms, {len(res['words'])} words")
        results.append(res)

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"Wrote manifest -> {manifest_path}")


if __name__ == "__main__":
    asyncio.run(main())
