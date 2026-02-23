import { useMemo, useState } from 'react'
import JSZip from 'jszip'
import './App.css'

const fmt = (n) => `${(n / 1024).toFixed(1)} KB`

function App() {
  const [files, setFiles] = useState([])
  const [quality, setQuality] = useState(80)
  const [resize, setResize] = useState(false)
  const [maxEdge, setMaxEdge] = useState(1600)
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)

  const summary = useMemo(() => {
    if (!results.length) return 'ファイル未変換'
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

    for (const f of files) {
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
      const name = f.name.replace(/\.(png|jpe?g)$/i, '') + '.webp'
      out.push({ name, blob, original: f.size, webp: blob.size })
    }

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
      <h1>PNG/JPEG → WebP 圧縮ツール</h1>
      <p className="muted">画像はブラウザ内で変換。サーバーには送信しません。</p>

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
        <span>{files.length ? `${files.length}件選択中` : 'PNG/JPEG対応'}</span>
      </label>

      <div className="card">
        <div className="row">
          <label>品質: <b>{quality}</b></label>
          <input type="range" min="50" max="95" value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
          <label><input type="checkbox" checked={resize} onChange={(e) => setResize(e.target.checked)} /> 長辺リサイズ</label>
          <input type="number" value={maxEdge} min="320" step="10" disabled={!resize} onChange={(e) => setMaxEdge(Number(e.target.value))} /> px
        </div>
        <div className="row">
          <button disabled={!files.length || busy} onClick={convert}>{busy ? '変換中...' : '変換開始'}</button>
          <button disabled={!results.length || busy} onClick={downloadZip}>ZIPで一括保存</button>
          <span className="muted">{summary}</span>
        </div>
      </div>

      {!!results.length && (
        <table>
          <thead>
            <tr><th>ファイル</th><th>元サイズ</th><th>WebP</th><th>削減率</th><th>保存</th></tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const reduced = ((1 - r.webp / r.original) * 100).toFixed(1)
              return (
                <tr key={r.name}>
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
      )}
    </div>
  )
}

export default App
