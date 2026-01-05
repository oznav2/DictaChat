# ℹ️ הצטרפו אליי

חברי קהילת המפתחים המוכשרת, בדיוק אלו ששולטים בידע עמוק וניסיון בסביבות של מערכות הפעלה, בפרישה קינפוג והגדרה של מערכות בסיסי נתונים מסוגים שונים, שמתכנתים בשפת גו, עם רקע מבוסס בפייתון, בטייפסקריפט, בג׳אווה סקריפט או חלק מהמילים הגבוהות של עולמות התכנות והסיסאופ, שהם בעיקר מתכנתים ואנשי סיסטם בנשמתם ועם רקע מוכח בפיתוח מערכות בקאנד, בחווית משתמש זמן אמת, ושמכירים דוקר, פודמן או בעלי הבנה בקלאסטרים של קוברניטיס, ובעיקר כאלו שרוצים להיות שותפים פעילים כחלק מהחזון הזה של העמדת כלי חינמי לטובת הציבור הישראלי ויש להם זמן אנרגיה ומשאבי זמן פנויים מוזמנים לדווח לי על תקלות והצעות לשיפור הקוד או הרחבה שלו.

# ℹ️ החזון

הנגישות לידע ולמקורות מידע מהימן ומעוגן אינה יכולה להיות יותר מותרות עבור אף אחד מאיתנו או מילדינו – ואסור שתהיה רק נחלתם של שכבה דקה של אלו שידם משגת. מבחינתי היא תנאי יסוד ונקודת הפתיחה להגשמה אפקטיבית של כל תהליך אמיתי לצמצום פערים חברתיים בעידן הטכנולוגי.

גם התלמיד או הסטודנט בפריפריה, כמו גם בעלת העסק הנאבקת על זכות קיומו של מקור פרנסתה, ובעיקר כל מי שבעצם אין לו הידע או האמצעים לגשר על הפערים הדרושים לרתום לעצמו ולטובתו בינה מלאכותית ישראלית חינמית וחכמה, יוכל מעכשיו להתנסות בשימוש במערכת בצורה חופשית ומוכנה לעבודה בסביבה מאובטחת.

זהו תהליך, וזו רק נקודת ההתחלה שלו. אני משוכנע שאם רק נרצה מספיק נוכל להנגיש אותו ליותר אנשים ובהרבה יותר פשטות ובקלות.

בהצלחה! ותהנו

אילן אלחיאני - מפתח הפרויקט

# Contributing to DictaChat

First off, thank you for considering contributing to DictaChat! It's people like you who make this project such a great tool for the community.

This project aims to provide a private, high-performance, and feature-rich AI chat interface focused on Hebrew language support and local execution.

---

## 🛠 Prerequisites

Before you start, ensure you have the following installed:

- **Go**: Version 1.22.1 or higher.
- **Python**: Version 3.11 or higher (with `venv` support).
- **Docker / Podman**: For containerized services (PostgreSQL, Redis, Frontend UI, etc.).
- **NVIDIA GPU**: Required for GPU acceleration (NVIDIA RTX 3090+ recommended).
- **CUDA Toolkit**: Properly configured on your host or WSL2 environment.

---

## 🚀 Getting Started

1.  **Clone the Repository**:

    ```bash
    git clone https://github.com/oznav2/DictaChat.git
    cd BricksLLM
    ```

2.  **Initialize Environment**:

    ```bash
    cp .env.heb .env
    # Edit .env to set your passwords and API keys (Tavily, Perplexity, etc.)
    ```

3.  **Download Models**:
    The system requires a GGUF model file. You can download it manually or let the installer handle it.

    ```bash
    mkdir -p ./models
    wget https://huggingface.co/VRDate/DictaLM-3.0-24B-Thinking-FP8-Q4_0-GGUF/resolve/main/dictalm-3.0-24b-thinking-fp8-q4_0.gguf -O ./models/dictalm-3.0-24b-thinking-fp8-q4_0.gguf
    ```

4.  **Run the Stack**:
    ```bash
    ./start.sh
    ```

---

## 🏗 Project Structure

- `cmd/bricksllm`: Main entry point for the Go-based gateway/server.
- `internal/`: Core logic, including adapters for various LLM providers, caching, and storage.
- `frontend-huggingface/`: The React-based chat interface.
- `datagov/`: Python scripts for government data integration.
- `mcp-sse-proxy/`: Bridging MCP servers to the chat interface.
- `scripts/`: Utility scripts for deployment and maintenance.

---

## 💻 Development Workflow

### Go Development

- Use standard Go formatting: `go fmt ./...`
- Run tests: `go test ./internal/...`
- Build the binary: `go build -o bricksllm ./cmd/bricksllm`

### Python Development

- A virtual environment (`.venv`) is automatically created by `start.sh`.
- Maintain `requirements.txt` or install dependencies via `pip`.

### Frontend Development

- Located in `frontend-huggingface/`.
- Standard React/Node.js workflow requirements.

### Adding New Tools (MCP)

- The project uses Model Context Protocol (MCP) to extend capabilities.
- Check `mcp-sse-proxy` for how tools are integrated.

---

## 🤝 Ways to contribute

- **Try DictaChat!**: Use the self-hosting platform and give us your feedback.
- **Add New Integrations**: Help us connect with more data sources or tools.
- **Translations**: Add or update translations to make DictaChat accessible to more people.
- **Fix Issues**: Help with open issues or create your own to improve the project.
- **Share Thoughts**: Share your suggestions and ideas with the community.
- **Content Creation**: Help create tutorials, blog posts, or documentation.
- **Propose Features**: Request a new feature by submitting a detailed proposal.
- **Report Bugs**: Help us find and squash bugs.
- **Improve Documentation**: Fix incomplete or missing docs, bad wording, or add better examples and explanations.

---

## 🚀 Missing a Feature?

If a feature is missing, you can directly request a new one here. You also can do the same by choosing "🚀 Feature" when raising a New Issue on our GitHub Repository. If you would like to implement it, an issue with your proposal must be submitted first, to be sure that we can use it. Please consider the guidelines given below.

---

## 📝 Submitting an issue

Before submitting a new issue, please search the issues tab. Maybe an issue or discussion already exists and might inform you of workarounds. Otherwise, you can give new information.

While we want to fix all the issues, before fixing a bug we need to be able to reproduce and confirm it. Please provide us with a minimal reproduction scenario using a repository or Gist. Having a live, reproducible scenario gives us the information without asking questions back & forth with additional questions like:

- 3rd-party libraries being used and their versions
- A use-case that fails

Without said minimal reproduction, we won't be able to investigate all issues, and the issue might not be resolved.

You can open a new issue with our issue forms.

### Naming conventions for issues

When opening a new issue, please use a clear and concise title that follows this format:

- For bugs: 🐛 Bug: [short description]
- For features: 🚀 Feature: [short description]
- For improvements: 🛠️ Improvement: [short description]
- For documentation: 📘 Docs: [short description]

**Examples:**

- 🐛 Bug: API token expiry time not saving correctly
- 📘 Docs: Clarify RAM requirement for local setup
- 🚀 Feature: Allow custom time selection for token expiration

This helps us triage and manage issues more efficiently.

---

## 🤝 Submitting Changes

1.  Fork the repo and create your branch from `main`.
2.  Ensure your code follows the existing style and passes all tests.
3.  Update documentation if you're adding new features.
4.  Open a Pull Request with a descriptive title and summary of changes.

---

## 💬 Community

Join us on [Discord](https://discord.gg/DictaChat) to discuss features, get help, and connect with other contributors.

---

**Am Israel Chai! 🇮🇱**
