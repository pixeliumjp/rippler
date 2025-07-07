// Prism.jsのコアと、必要な言語・プラグインをインポート
import Prism from "https://esm.sh/prismjs@1.29.0";
// --- 言語コンポーネント (インポートするだけで有効になる) ---
import "https://esm.sh/prismjs@1.29.0/components/prism-javascript";
import "https://esm.sh/prismjs@1.29.0/components/prism-bash";
import "https://esm.sh/prismjs@1.29.0/components/prism-markup";
// --- プラグイン (インポートするだけで有効になる) ---
import "https://esm.sh/prismjs@1.29.0/plugins/toolbar/prism-toolbar";
import "https://esm.sh/prismjs@1.29.0/plugins/line-numbers/prism-line-numbers";

// Ripplerライブラリのインポート
import Rippler from "https://cdn.jsdelivr.net/gh/pixeliumjp/rippler@1.0.0/src/rippler.min.js";

// Ripplerの初期化
const rippleElement_visual = document.querySelector(".visual");
if (rippleElement_visual) {
	new Rippler(rippleElement_visual, {
		resolution: 128,
		dropRadius: 20,
		perturbance: 0.04,
		interactive: true,
		imageUrl: "bg.jpg",
	});
}

const rippleElement_default = document.querySelector(".rippler.default");
if (rippleElement_default) {
	new Rippler(rippleElement_default);
}

const rippleElement_second = document.querySelector(".rippler.second");
if (rippleElement_second) {
	new Rippler(rippleElement_second, {
		resolution: 256,
		dropRadius: 10,
		perturbance: 0.04,
		interactive: true,
		imageUrl: "bg.jpg",
	});
}

// Prismのハイライト実行
document.addEventListener("DOMContentLoaded", () => {
	Prism.highlightAll();
});

// --- コードコピー機能 ---

function showCopiedMessage(button) {
	button.textContent = "コピーしました！";
	button.classList.add("copied");
	setTimeout(() => {
		button.textContent = "コピー";
		button.classList.remove("copied");
	}, 2000);
}

export function copyCode(button) {
	const codeBlock = button.parentElement.nextElementSibling.querySelector("code");
	if (!codeBlock) return;

	const text = codeBlock.textContent.trim();

	if (navigator.clipboard && globalThis.isSecureContext) {
		navigator.clipboard.writeText(text).then(
			() => showCopiedMessage(button),
			() => alert("コードのコピーに失敗しました。"),
		);
	} else {
		const textArea = document.createElement("textarea");
		textArea.value = text;
		textArea.style.position = "fixed";
		textArea.style.left = "-9999px";
		document.body.appendChild(textArea);
		textArea.select();
		try {
			document.execCommand("copy");
			showCopiedMessage(button);
		} catch (err) {
			console.error("フォールバックでのコピーに失敗:", err);
			alert("コードのコピーに失敗しました。");
		}
		document.body.removeChild(textArea);
	}
}

// HTMLのonclickから呼び出せるようにグローバルスコープに割り当てる
globalThis.copyCode = copyCode;
