/**
 * 2D アフィン変換行列。2x2 行列の要素を表す。
 * 変換は (x, y) → (a*x + b*y, c*x + d*y) となる。
 * @typedef {{ a: number, b: number, c: number, d: number }} Matrix2D
 */

/** @type {Record<string, Record<string, string>> | null} 多言語翻訳テーブル */
let translations = null;

const APP_CONFIG = Object.freeze({
    identityMatrix: Object.freeze({ a: 1, b: 0, c: 0, d: 1 }),
    matrixInputFallback: 0,
    matrixInterpolation: 0.12,
    determinantWarningThreshold: 0.01,
    gridMin: -15,
    gridMax: 15,
    arrowHeadLength: 12,
    arrowHeadWidth: 6,
    vectorStrokeWidth: 4,
    gridLineWidth: 1,
    gridBaseDark: "#333",
    gridBaseLight: "#f1f3f5",
    gridTransformedDark: "rgba(46, 204, 113, 0.4)",
    gridTransformedLight: "rgba(46, 204, 113, 0.2)",
});

/**
 * メインアプリケーションオブジェクト。
 * 行列変換ビジュアライザーの状態管理と描画ロジックを統括する。
 */
const app = {
    /** @type {Matrix2D} 現在の行列状態（補間中） */
    current: { ...APP_CONFIG.identityMatrix },
    /** @type {Matrix2D} 目標となる行列状態 */
    target: { ...APP_CONFIG.identityMatrix },
    /** @type {string} 現在の言語設定（"ja" または "en"） */
    lang: "ja",
    /** @type {number} 現在のテーマインデックス */
    themeIdx: 0,
    /** @type {string[]} 利用可能なテーマ名の配列 */
    themes: ["system", "light", "dark"],
    /** @type {number} 座標系のスケーリング係数（ピクセル/単位） */
    scale: 60,

    /**
     * アプリケーションの初期化処理を行う。
     * DOM 参照、イベント登録、翻訳・テーマ反映、描画ループ開始をまとめて実行する。
     * @param {typeof APP_CONFIG} config - アプリケーション設定オブジェクト
     * @returns {void}
     */
    init(config) {
        this.config = config;
        this.canvas = document.getElementById("canvas");
        this.ctx = this.canvas.getContext("2d");

        window.addEventListener("resize", () => this.resize());
        document.querySelectorAll("input[type='number']").forEach((el) => {
            el.addEventListener("input", () => this.manualSync(config));
        });

        this.applyTranslations();
        this.applyTheme();
        this.resize(config);
        this.loop(config);
    },

    /* --- 多言語対応 --- */
    /**
     * 表示言語を日本語と英語で切り替える。
     * ボタンの表示も同時に更新し、翻訳を再適用する。
     * @returns {void}
     */
    toggleLang() {
        this.lang = this.lang === "ja" ? "en" : "ja";
        document.documentElement.title = this.lang;
        document.getElementById("lang-btn").textContent =
            this.lang === "ja" ? "🌐 EN" : "🌐 JA";
        this.applyTranslations();
    },
    /**
     * 現在の言語に応じて、`data-i18n` 属性を持つ要素の文言を更新する。
     * i18n.json から読み込んだ翻訳テーブルを参照する。
     * @returns {void}
     */
    applyTranslations() {
        if (!translations) {
            return;
        }
        document.querySelectorAll("[data-i18n]").forEach((el) => {
            const key = el.getAttribute("data-i18n");
            el.textContent = translations[this.lang][key];
        });
    },

    /* --- テーマ管理 --- */
    /**
     * テーマを次の候補へ切り替える。
     * system → light → dark → system の順で循環する。
     * @returns {void}
     */
    toggleTheme() {
        this.themeIdx = (this.themeIdx + 1) % this.themes.length;
        this.applyTheme();
    },
    /**
     * 現在のテーマ設定を DOM に反映する。
     * "system" の場合は OS のカラースキームを参照し、
     * "light" または "dark" の場合は指定されたテーマを適用する。
     * @returns {void}
     */
    applyTheme() {
        const theme = this.themes[this.themeIdx];
        const icons = { system: "💻", light: "☀️", dark: "🌙" };
        document.getElementById("theme-btn").textContent = icons[theme];

        let isDark = theme === "dark";
        if (theme === "system") {
            isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        }
        document.documentElement.setAttribute(
            "data-theme",
            isDark ? "dark" : "light",
        );
    },

    /* --- 行列計算 --- */
    /**
     * 左から 2x2 行列を掛け合わせて、目標行列を更新する。
     * 行列 [[t1, t2], [t3, t4]] を左から乗算する。
     * @param {number} t1 - 変換行列の (0,0) 要素
     * @param {number} t2 - 変換行列の (0,1) 要素
     * @param {number} t3 - 変換行列の (1,0) 要素
     * @param {number} t4 - 変換行列の (1,1) 要素
     * @param {typeof APP_CONFIG} [config=this.config] - アプリケーション設定（デフォルト: this.config）
     * @returns {void}
     */
    multiply(t1, t2, t3, t4, config = this.config) {
        const { a, b, c, d } = this.target;
        this.target.a = t1 * a + t2 * c;
        this.target.b = t1 * b + t2 * d;
        this.target.c = t3 * a + t4 * c;
        this.target.d = t3 * b + t4 * d;
        this.updateInputs(config);
    },
    /**
     * 数値入力欄の値を読み取り、目標行列へ同期する。
     * 入力値が空の場合は設定の matrixInputFallback を使用する。
     * @param {typeof APP_CONFIG} [config=this.config] - アプリケーション設定（デフォルト: this.config）
     * @returns {void}
     */
    manualSync(config = this.config) {
        this.target.a =
            parseFloat(document.getElementById("m-a").value) ||
            config.matrixInputFallback;
        this.target.b =
            parseFloat(document.getElementById("m-b").value) ||
            config.matrixInputFallback;
        this.target.c =
            parseFloat(document.getElementById("m-c").value) ||
            config.matrixInputFallback;
        this.target.d =
            parseFloat(document.getElementById("m-d").value) ||
            config.matrixInputFallback;
        this.updateUI(config);
    },
    /**
     * 目標行列を入力欄へ反映し、行列式の表示も更新する。
     * 値は小数点以下 2 桁で表示される。
     * @param {typeof APP_CONFIG} [config=this.config] - アプリケーション設定（デフォルト: this.config）
     * @returns {void}
     */
    updateInputs(config = this.config) {
        document.getElementById("m-a").value = this.target.a.toFixed(2);
        document.getElementById("m-b").value = this.target.b.toFixed(2);
        document.getElementById("m-c").value = this.target.c.toFixed(2);
        document.getElementById("m-d").value = this.target.d.toFixed(2);
        this.updateUI(config);
    },
    /**
     * 目標行列の行列式を計算して表示し、警告を制御する。
     * 行列式がほぼ 0 の場合（determinantWarningThreshold 以下）は警告を表示する。
     * @param {typeof APP_CONFIG} [config=this.config] - アプリケーション設定（デフォルト: this.config）
     * @returns {void}
     */
    updateUI(config = this.config) {
        const det =
            this.target.a * this.target.d - this.target.b * this.target.c;
        document.getElementById("det-text").textContent = det.toFixed(2);
        document.getElementById("det-warn").style.display =
            Math.abs(det) < config.determinantWarningThreshold
                ? "block"
                : "none";
    },
    /**
     * 目標行列を単位行列へリセットし、入力欄を更新する。
     * @param {typeof APP_CONFIG} [config=this.config] - アプリケーション設定（デフォルト: this.config）
     * @returns {void}
     */
    resetMatrix(config = this.config) {
        this.target = { ...config.identityMatrix };
        this.updateInputs(config);
    },

    /* --- 描画ロジック --- */
    /**
     * キャンバスのサイズを親要素に合わせてリサイズする。
     * ウィンドウリサイズイベントで自動的に呼び出される。
     * @returns {void}
     */
    resize() {
        this.canvas.width = this.canvas.parentElement.clientWidth;
        this.canvas.height = this.canvas.parentElement.clientHeight;
    },
    /**
     * メインのアニメーションループ。
     * 毎フレーム update → draw → requestAnimationFrame を実行する。
     * @param {typeof APP_CONFIG} [config=this.config] - アプリケーション設定（デフォルト: this.config）
     * @returns {void}
     */
    loop(config = this.config) {
        this.update(config);
        this.draw(config);
        requestAnimationFrame(() => this.loop(config));
    },
    /**
     * current 行列を target 行列に向かって補間更新する。
     * 補間係数は config.matrixInterpolation で制御される。
     * @param {typeof APP_CONFIG} [config=this.config] - アプリケーション設定（デフォルト: this.config）
     * @returns {void}
     */
    update(config = this.config) {
        const lerp = config.matrixInterpolation;
        ["a", "b", "c", "d"].forEach((k) => {
            this.current[k] += (this.target[k] - this.current[k]) * lerp;
        });
    },
    /**
     * 現在の行列状態をキャンバスへ描画する。
     * 元のグリッド、変形後のグリッド、基底ベクトルを描画する。
     * @param {typeof APP_CONFIG} [config=this.config] - アプリケーション設定（デフォルト: this.config）
     * @returns {void}
     */
    draw(config = this.config) {
        const { ctx, canvas, scale, current } = this;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const cx = canvas.width / 2,
            cy = canvas.height / 2;
        const isDark =
            document.documentElement.getAttribute("data-theme") === "dark";

        const project = (x, y, m) => ({
            x: cx + (m.a * x + m.b * y) * scale,
            y: cy - (m.c * x + m.d * y) * scale,
        });

        // グリッド背景
        ctx.lineWidth = config.gridLineWidth;
        ctx.strokeStyle = isDark ? config.gridBaseDark : config.gridBaseLight;
        for (let i = config.gridMin; i <= config.gridMax; i++) {
            let s = project(i, config.gridMin, config.identityMatrix),
                e = project(i, config.gridMax, config.identityMatrix);
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(e.x, e.y);
            ctx.stroke();
            ((s = project(config.gridMin, i, config.identityMatrix)),
                (e = project(config.gridMax, i, config.identityMatrix)));
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(e.x, e.y);
            ctx.stroke();
        }

        // 変形グリッド
        ctx.strokeStyle = isDark
            ? config.gridTransformedDark
            : config.gridTransformedLight;
        for (let i = config.gridMin; i <= config.gridMax; i++) {
            let s = project(i, config.gridMin, current),
                e = project(i, config.gridMax, current);
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(e.x, e.y);
            ctx.stroke();
            ((s = project(config.gridMin, i, current)),
                (e = project(config.gridMax, i, current)));
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(e.x, e.y);
            ctx.stroke();
        }

        this.drawVec(1, 0, current, "#e74c3c", config);
        this.drawVec(0, 1, current, "#3498db", config);
    },
    /**
     * 2D ベクトルを行列変換後の向きとして、矢印付きで描画する。
     * キャンバス中央を原点として、行列 m によって変換されたベクトルを描画する。
     * @param {number} x - ベクトルの x 成分
     * @param {number} y - ベクトルの y 成分
     * @param {Matrix2D} m - 適用する変換行列
     * @param {string} color - ベクトルの描画色（CSS カラー値）
     * @param {typeof APP_CONFIG} [config=this.config] - アプリケーション設定（デフォルト: this.config）
     * @returns {void}
     */
    drawVec(x, y, m, color, config = this.config) {
        const cx = this.canvas.width / 2,
            cy = this.canvas.height / 2;
        const tx = (m.a * x + m.b * y) * this.scale,
            ty = (m.c * x + m.d * y) * this.scale;
        const ctx = this.ctx;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = ctx.fillStyle = color;
        ctx.lineWidth = config.vectorStrokeWidth;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(tx, -ty);
        ctx.stroke();

        const angle = Math.atan2(-ty, tx);
        ctx.translate(tx, -ty);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-config.arrowHeadLength, -config.arrowHeadWidth);
        ctx.lineTo(-config.arrowHeadLength, config.arrowHeadWidth);
        ctx.fill();
        ctx.restore();
    },
};

/**
 * i18n.json から翻訳データを読み込む。
 * ネットワークエラーや読み込み失敗時は例外をスロー する。
 * @throws {Error} ファイル読み込み失敗時
 * @returns {Promise<void>}
 */
async function loadTranslations() {
    const response = await fetch("i18n.json");
    if (!response.ok) {
        throw new Error(`Failed to load i18n.json: ${response.status}`);
    }
    translations = await response.json();
}

/**
 * アプリケーションのブートストラッププロセス。
 * 翻訳データを読み込み、エラーハンドリング後に app.init() を呼び出す。
 * @returns {Promise<void>}
 */
async function bootstrap() {
    try {
        await loadTranslations();
        app.init(APP_CONFIG);
    } catch (error) {
        console.error(error);
    }
}

bootstrap();
