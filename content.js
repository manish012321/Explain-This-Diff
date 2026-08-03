console.log("Explain This Diff: content script loaded");

const BACKEND_URL = "http://localhost:3000/explain";

function extractDiffText() {
  const files = document.querySelectorAll(".file");
  let result = "";

  files.forEach((file) => {
    const filename = file.getAttribute("data-tagsearch-path");

    const addedLines = file.querySelectorAll(".blob-code-addition .blob-code-inner");
    const removedLines = file.querySelectorAll(".blob-code-deletion .blob-code-inner");

    result += `File: ${filename}\n`;

    removedLines.forEach((line) => {
      result += `- ${line.innerText}\n`;
    });

    addedLines.forEach((line) => {
      result += `+ ${line.innerText}\n`;
    });

    result += "\n";
  });

  return result.trim();
}

function findFilesTab() {
  let tab = document.getElementById("prs-files-anchor-tab");
  if (tab) return tab;

  tab = document.querySelector('a.tabnav-tab[href$="/files"]');
  if (tab) return tab;

  return null;
}

// ---------- Minimal, safe markdown renderer ----------
// Escapes HTML first (so the AI's text can never inject real tags),
// then converts a small, deliberate subset of markdown to HTML.
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMarkdown(rawText) {
  let text = escapeHtml(rawText);

  // Bold: **text**
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Inline code: `text`
  text = text.replace(/`(.+?)`/g, "<code>$1</code>");

  // Convert lines starting with "- " or "* " into <li> groups
  const lines = text.split("\n");
  let html = "";
  let inList = false;

  for (const line of lines) {
    const isBullet = /^\s*[-*]\s+/.test(line);

    if (isBullet) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${line.replace(/^\s*[-*]\s+/, "")}</li>`;
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      if (line.trim().length > 0) {
        html += `<p>${line}</p>`;
      }
    }
  }
  if (inList) html += "</ul>";

  return html;
}

// ---------- Panel management ----------
function getOrCreatePanel() {
  let panel = document.getElementById("explain-diff-panel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "explain-diff-panel";

  const fileTab = findFilesTab();
  const anchor = fileTab
    ? fileTab.closest(".tabnav, .PullRequestHeaderTabNav-module__TabNavList__d_nKN")?.parentElement
    : null;

  if (anchor) {
    anchor.insertAdjacentElement("afterend", panel);
  } else if (fileTab) {
    fileTab.parentElement.insertAdjacentElement("afterend", panel);
  } else {
    document.body.prepend(panel);
  }

  return panel;
}

function closePanel() {
  const panel = document.getElementById("explain-diff-panel");
  if (panel) panel.remove();
}

// Scrolls the panel into view smoothly, so the user doesn't have to
// hunt for it after clicking the button.
function scrollPanelIntoView(panel) {
  panel.scrollIntoView({ behavior: "smooth", block: "center" });
}

function setButtonText(text) {
  const button = document.getElementById("explain-diff-btn");
  if (button) button.textContent = text;
}

function showPanelLoading() {
  setButtonText("↓ Scroll down for summary...");

  const panel = getOrCreatePanel();
  panel.className = "explain-diff-panel loading";
  panel.innerHTML = `
    <div class="explain-diff-header">
      <strong>✨ Explain this Diff</strong>
    </div>
    <div class="explain-diff-loading-row">
      <span class="explain-diff-spinner"></span>
      <span>Analyzing changes...</span>
    </div>
  `;
  scrollPanelIntoView(panel);
}

function showPanelResult(summary) {
  setButtonText("✨ Explain this Diff");

  const panel = getOrCreatePanel();
  panel.className = "explain-diff-panel";
  panel.innerHTML = `
    <div class="explain-diff-header">
      <strong>✨ AI Summary</strong>
      <button class="explain-diff-close" title="Close" aria-label="Close">&times;</button>
    </div>
    <div class="explain-diff-body">${renderMarkdown(summary)}</div>
  `;
  panel.querySelector(".explain-diff-close").addEventListener("click", closePanel);
  scrollPanelIntoView(panel);
}

function showPanelError(message) {
  setButtonText("✨ Explain this Diff");

  const panel = getOrCreatePanel();
  panel.className = "explain-diff-panel error";
  panel.innerHTML = `
    <div class="explain-diff-header">
      <strong>⚠️ Explain this Diff</strong>
      <button class="explain-diff-close" title="Close" aria-label="Close">&times;</button>
    </div>
    <div class="explain-diff-body"><p>${escapeHtml(message)}</p></div>
  `;
  panel.querySelector(".explain-diff-close").addEventListener("click", closePanel);
  scrollPanelIntoView(panel);
}

// ---------- Main click handler ----------
async function onExplainClick() {
  const diffText = extractDiffText();

  if (!diffText) {
    showPanelError("No diff found — make sure you're on the 'Files changed' tab.");
    return;
  }

  showPanelLoading();

  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diffText }),
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    const data = await response.json();
    showPanelResult(data.summary);
  } catch (err) {
    console.error("Explain This Diff error:", err);
    showPanelError("Couldn't reach the AI service. Is your backend server running?");
  }
}

function injectButton() {
  if (document.getElementById("explain-diff-btn")) return true;

  const fileTab = findFilesTab();
  if (!fileTab) return false;

  const tabBar = fileTab.parentElement;

  const button = document.createElement("button");
  button.id = "explain-diff-btn";
  button.textContent = "✨ Explain this Diff";
  button.className = "explain-diff-button";

  button.addEventListener("click", onExplainClick);

  tabBar.appendChild(button);
  return true;
}

injectButton();

const observer = new MutationObserver(() => {
  injectButton();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});