import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import './App.css'

const fmt = (n) => `${(n / 1024).toFixed(1)} KB`

const LOGO_EXTS = ['png', 'svg', 'webp', 'jpg']

function Logo() {
  const [extIdx, setExtIdx] = useState(0)
  const [failed, setFailed] = useState(false)

  if (failed) return <span className="logo-text">gorou</span>

  return (
    <img
      src={`${import.meta.env.BASE_URL}logo-gorou.${LOGO_EXTS[extIdx]}`}
      alt="gorou"
      className="logo-img"
      onError={() => {
        if (extIdx + 1 < LOGO_EXTS.length) setExtIdx(extIdx + 1)
        else setFailed(true)
      }}
    />
  )
}

function ErrorBanner({ errors, onDismiss }) {
  if (!errors.length) return null
  return (
    <div className="error-banner" role="alert">
      <div className="error-banner-body">
        <span>以下のファイルは対応外です（PNG/JPEGのみ）</span>
        <ul>
          {errors.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>
      <button className="error-dismiss" onClick={onDismiss} aria-label="閉じる">×</button>
    </div>
  )
}

function BeforeGrid({ previews }) {
  return (
    <section>
      <div className="section-title">変換前プレビュー</div>
      <div className="before-grid">
        {previews.map((p, i) => (
          <div key={`${i}-${p.name}`} className="before-card">
            <img src={p.url} alt={p.name} className="before-thumb" />
            <div className="before-info">
              <span className="before-name">{p.name}</span>
              <span className="muted">{fmt(p.size)}</span>
              {p.width && p.height && (
                <span className="muted">{p.width}×{p.height}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ResultCard({ r, onSave }) {
  const reduced = r.error ? null : ((1 - r.webp / r.original) * 100).toFixed(1)
  return (
    <div className={`result-card${r.error ? ' result-card-error' : ''}`}>
      <div className="thumb-pair">
        {r.error ? (
          <div className="thumb-error" aria-label="変換エラー">!</div>
        ) : (
          <>
            <div className="thumb-item">
              <img src={r.originalUrl} alt="元" className="thumb" />
              <span className="thumb-label">元</span>
            </div>
            <div className="thumb-item">
              <img src={r.webpUrl} alt="WebP" className="thumb" />
              <span className="thumb-label">WebP</span>
            </div>
          </>
        )}
      </div>
      <div className="card-info">
        <span className="card-name">{r.name}</span>
        {r.error ? (
          <span className="card-error-msg">{r.error}</span>
        ) : (
          <>
            <span className="muted">{fmt(r.original)} → {fmt(r.webp)}</span>
            <span className="muted">削減: {reduced}%</span>
          </>
        )}
      </div>
      {!r.error && (
        <button className="card-save" onClick={() => onSave(r)}>保存</button>
      )}
    </div>
  )
}

function App() {
  const [files, setFiles] = useState([])
  const [fileErrors, setFileErrors] = useState([])
  const [quality, setQuality] = useState(80)
  const [resize, setResize] = useState(false)
  const [maxEdge, setMaxEdge] = useState(1600)
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [inputPreviews, setInputPreviews] = useState([])
  const previewUrlsRef = useRef([])
  const inputPreviewUrlsRef = useRef([])

  // Revoke all preview URLs on unmount
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      inputPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  // Generate input previews when files change
  useEffect(() => {
    if (!files.length) {
      inputPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      inputPreviewUrlsRef.current = []
      setInputPreviews([])
      return
    }

    const newUrls = []
    const promises = files.map((f) => {
      const url = URL.createObjectURL(f)
      newUrls.push(url)
      return new Promise((resolve) => {
        const img = new Image()
        img.onload = () =>
          resolve({ name: f.name, size: f.size, url, width: img.naturalWidth, height: img.naturalHeight })
        img.onerror = () =>
          resolve({ name: f.name, size: f.size, url, width: null, height: null })
        img.src = url
      })
    })

    Promise.all(promises).then((previews) => {
      inputPreviewUrlsRef.current.forEach((u) => URL.revokeObjectURL(u))
      inputPreviewUrlsRef.current = newUrls
      setInputPreviews(previews)
    })
  }, [files])

  const summary = useMemo(() => {
    if (!results.length) return null
    const ok = results.filter((r) => !r.error)
    if (!ok.length) return `完了: 0件（全て失敗）`
    const totalO = ok.reduce((a, b) => a + b.original, 0)
    const totalW = ok.reduce((a, b) => a + b.webp, 0)
    const ratio = ((1 - totalW / totalO) * 100).toFixed(1)
    return `完了: ${ok.length}件 / ${fmt(totalO)} → ${fmt(totalW)}（${ratio}%削減）`
  }, [results])

  const pickFiles = (list) => {
    const all = [...list]
    const picked = all.filter((f) => /image\/(png|jpeg)/.test(f.type))
    const rejected = all.filter((f) => !/image\/(png|jpeg)/.test(f.type)).map((f) => f.name)
    setFiles(picked)
    setResults([])
    setFileErrors(rejected)
  }

  const onDrop = (e) => {
    e.preventDefault()
    pickFiles(e.dataTransfer.files)
  }

  const fileToImage = (file) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = reject
      img.src = url
    })

  const canvasToBlob = (canvas, q) =>
    new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', q))

  const download = (blob, name) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 500)
  }

  const convert = async () => {
    setBusy(true)
    setProgress({ current: 0, total: files.length })
    const q = quality / 100
    const out = []
    const newUrls = []

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      setProgress({ current: i + 1, total: files.length })
      const name = f.name.replace(/\.(png|jpe?g)$/i, '') + '.webp'

      try {
        const originalUrl = URL.createObjectURL(f)
        newUrls.push(originalUrl)

        const img = await fileToImage(f)
        let w = img.width
        let h = img.height

        if (resize && Math.max(w, h) > maxEdge) {
          const r = maxEdge / Math.max(w, h)
          w = Math.round(w * r)
          h = Math.round(h * r)
        }

        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        const blob = await canvasToBlob(c, q)
        const webpUrl = URL.createObjectURL(blob)
        newUrls.push(webpUrl)

        out.push({ name, blob, original: f.size, webp: blob.size, originalUrl, webpUrl, error: null })
      } catch {
        out.push({
          name,
          blob: null,
          original: f.size,
          webp: 0,
          originalUrl: null,
          webpUrl: null,
          error: '変換に失敗しました。品質を下げるか、枚数を減らして再試行してください。',
        })
      }
    }

    // Revoke previous preview URLs before replacing
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrlsRef.current = newUrls

    setResults(out)
    setBusy(false)
  }

  const downloadZip = async () => {
    const zip = new JSZip()
    results.filter((r) => !r.error).forEach((r) => zip.file(r.name, r.blob))
    const blob = await zip.generateAsync({ type: 'blob' })
    download(blob, 'webp-converted.zip')
  }

  const hasResults = results.length > 0
  const hasSuccessResults = results.some((r) => !r.error)

  return (
    <div className="wrap">
      {/* Header */}
      <header className="app-header">
        <Logo />
        <div className="app-title">
          <h1>PNG/JPEG → WebP 圧縮ツール</h1>
          <p className="muted">画像はブラウザ内で変換。サーバーには送信しません。</p>
        </div>
      </header>

      {/* Drop zone */}
      <section>
        <label
          className="drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          aria-label="ファイルをドラッグ&ドロップまたはクリックして選択"
        >
          <input
            hidden
            type="file"
            multiple
            accept="image/png,image/jpeg"
            onChange={(e) => pickFiles(e.target.files)}
          />
          <strong>ドラッグ&ドロップ / クリックで選択</strong>
          <span className="muted">{files.length ? `${files.length}件選択中` : 'PNG / JPEG 対応'}</span>
        </label>
        <ErrorBanner errors={fileErrors} onDismiss={() => setFileErrors([])} />
      </section>

      {/* Settings */}
      <section className="card">
        <div className="section-title">変換設定</div>
        <div className="row">
          <label>品質: <b>{quality}</b></label>
          <input
            type="range"
            min="50"
            max="95"
            value={quality}
            aria-label="変換品質"
            onChange={(e) => setQuality(Number(e.target.value))}
          />
          <label>
            <input
              type="checkbox"
              checked={resize}
              onChange={(e) => setResize(e.target.checked)}
            />
            {' '}長辺リサイズ
          </label>
          <input
            type="number"
            value={maxEdge}
            min="320"
            step="10"
            disabled={!resize}
            onChange={(e) => setMaxEdge(Number(e.target.value))}
          />
          <span>px</span>
        </div>
        <div className="row">
          <button disabled={!files.length || busy} onClick={convert}>
            {busy ? '変換中...' : '変換開始'}
          </button>
          <button disabled={!hasSuccessResults || busy} onClick={downloadZip}>
            ZIP で一括保存
          </button>
          {busy && (
            <span className="muted" aria-live="polite">処理中: {progress.current}/{progress.total}</span>
          )}
          {!busy && summary && <span className="muted">{summary}</span>}
        </div>
      </section>

      {/* Before grid */}
      {files.length > 0 && inputPreviews.length > 0 && (
        <BeforeGrid previews={inputPreviews} />
      )}

      {/* Results */}
      {hasResults && (
        <section>
          <div className="section-title">変換後プレビュー</div>
          <div className="result-grid">
            {results.map((r, i) => (
              <ResultCard key={`${i}-${r.name}`} r={r} onSave={(r) => download(r.blob, r.name)} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export default App
