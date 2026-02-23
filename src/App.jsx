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

function App() {
  const [files, setFiles] = useState([])
  const [quality, setQuality] = useState(80)
  const [resize, setResize] = useState(false)
  const [maxEdge, setMaxEdge] = useState(1600)
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const previewUrlsRef = useRef([])

  // Revoke all preview URLs on unmount
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const summary = useMemo(() => {
    if (!results.length) return null
    const totalO = results.reduce((a, b) => a + b.original, 0)
    const totalW = results.reduce((a, b) => a + b.webp, 0)
    const ratio = ((1 - totalW / totalO) * 100).toFixed(1)
    return `完了: ${results.length}件 / ${fmt(totalO)} → ${fmt(totalW)}（${ratio}%削減）`
  }, [results])

  const pickFiles = (list) => {
    const picked = [...list].filter((f) => /image\/(png|jpeg)/.test(f.type))
    setFiles(picked)
    setResults([])
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
    const q = quality / 100
    const out = []
    const newUrls = []

    for (const f of files) {
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

      const name = f.name.replace(/\.(png|jpe?g)$/i, '') + '.webp'
      out.push({ name, blob, original: f.size, webp: blob.size, originalUrl, webpUrl })
    }

    // Revoke previous preview URLs before replacing
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrlsRef.current = newUrls

    setResults(out)
    setBusy(false)
  }

  const downloadZip = async () => {
    const zip = new JSZip()
    results.forEach((r) => zip.file(r.name, r.blob))
    const blob = await zip.generateAsync({ type: 'blob' })
    download(blob, 'webp-converted.zip')
  }

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
          <button disabled={!results.length || busy} onClick={downloadZip}>
            ZIP で一括保存
          </button>
          {summary && <span className="muted">{summary}</span>}
        </div>
      </section>

      {/* Results */}
      {!!results.length && (
        <section>
          <div className="section-title">変換結果</div>
          <table>
            <thead>
              <tr>
                <th>プレビュー（元 / WebP）</th>
                <th>ファイル名</th>
                <th>元サイズ</th>
                <th>WebP</th>
                <th>削減率</th>
                <th>保存</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const reduced = ((1 - r.webp / r.original) * 100).toFixed(1)
                return (
                  <tr key={r.name}>
                    <td className="preview-cell">
                      <div className="preview-pair">
                        <div className="preview-item">
                          <img src={r.originalUrl} alt="original" className="thumb" />
                          <span className="preview-label">元</span>
                        </div>
                        <div className="preview-item">
                          <img src={r.webpUrl} alt="webp" className="thumb" />
                          <span className="preview-label">WebP</span>
                        </div>
                      </div>
                    </td>
                    <td>{r.name}</td>
                    <td>{fmt(r.original)}</td>
                    <td>{fmt(r.webp)}</td>
                    <td>{reduced}%</td>
                    <td><button onClick={() => download(r.blob, r.name)}>保存</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

export default App
