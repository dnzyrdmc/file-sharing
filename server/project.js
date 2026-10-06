import { randomBytes, createHash } from "node:crypto";
export default function ({
  db,
  app,
  router,
  run,
  get,
  all,
  tx,
  id,
  now,
  text,
  integer,
  required,
  fail,
  hash,
}) {
  db.exec(`CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,owner TEXT REFERENCES users(id),name TEXT,size INTEGER,total INTEGER,status TEXT DEFAULT 'uploading',created_at TEXT);
 CREATE TABLE IF NOT EXISTS chunks(file TEXT REFERENCES files(id) ON DELETE CASCADE,part INTEGER,data BLOB,PRIMARY KEY(file,part));
 CREATE TABLE IF NOT EXISTS shares(token_hash TEXT PRIMARY KEY,file TEXT REFERENCES files(id) ON DELETE CASCADE,expires INTEGER);`);
  function content(fid) {
    return Buffer.concat(
      all("SELECT data FROM chunks WHERE file=? ORDER BY part", fid).map((x) =>
        Buffer.from(x.data),
      ),
    );
  }
  function send(res, f) {
    res.set("Content-Type", "application/octet-stream");
    res.attachment(f.name.replace(/[^\w. -]/g, "_"));
    res.send(content(f.id));
  }
  router.get("/files", (req, res) =>
    res.json(
      all(
        "SELECT id,name,size,total,status,created_at FROM files WHERE owner=?",
        req.user.id,
      ),
    ),
  );
  router.post("/uploads", (req, res) => {
    const size = integer(req.body.size, 1, 8 * 1024 * 1024),
      total = integer(req.body.total, 1, 32),
      fid = id();
    if (total !== Math.ceil(size / (256 * 1024)))
      fail(422, "Parça sayısı dosya boyutuyla uyuşmuyor");
    run(
      "INSERT INTO files(id,owner,name,size,total,created_at) VALUES(?,?,?,?,?,?)",
      fid,
      req.user.id,
      text(req.body.name, 200),
      size,
      total,
      now(),
    );
    res.status(201).json({ id: fid });
  });
  router.put("/uploads/:id/parts/:part", (req, res) => {
    const f = required(
      get(
        "SELECT * FROM files WHERE id=? AND owner=?",
        req.params.id,
        req.user.id,
      ),
    );
    if (f.status !== "uploading") fail(409, "Yükleme tamamlandı");
    const part = integer(req.params.part, 0, f.total - 1),
      buf = Buffer.from(text(req.body.base64, 400000), "base64");
    const expected =
      part === f.total - 1 ? f.size - part * 256 * 1024 : 256 * 1024;
    if (buf.length !== expected) fail(422, "Parça boyutu geçersiz");
    run(
      "INSERT INTO chunks VALUES(?,?,?) ON CONFLICT(file,part) DO UPDATE SET data=excluded.data",
      f.id,
      part,
      buf,
    );
    res.json({ ok: true });
  });
  router.post("/uploads/:id/complete", (req, res) => {
    const result = tx(() => {
      const f = required(
        get(
          "SELECT * FROM files WHERE id=? AND owner=?",
          req.params.id,
          req.user.id,
        ),
      );
      if (get("SELECT COUNT(*) n FROM chunks WHERE file=?", f.id).n !== f.total)
        fail(409, "Eksik parça");
      const buf = content(f.id);
      if (buf.length !== f.size) fail(409, "Boyut uyuşmuyor");
      run("UPDATE files SET status='ready' WHERE id=?", f.id);
      return { id: f.id, sha256: hash(buf) };
    });
    res.json(result);
  });
  router.get("/files/:id/download", (req, res) => {
    const f = required(
      get(
        "SELECT * FROM files WHERE id=? AND owner=? AND status='ready'",
        req.params.id,
        req.user.id,
      ),
    );
    send(res, f);
  });
  router.post("/files/:id/share", (req, res) => {
    const f = required(
      get(
        "SELECT * FROM files WHERE id=? AND owner=? AND status='ready'",
        req.params.id,
        req.user.id,
      ),
    );
    const token = randomBytes(24).toString("base64url"),
      expires = Date.now() + 3600000;
    run("INSERT INTO shares VALUES(?,?,?)", hash(token), f.id, expires);
    res.json({ path: "/share/" + token, expires });
  });
  app.get("/share/:token", (req, res) => {
    const s = required(
      get("SELECT * FROM shares WHERE token_hash=?", hash(req.params.token)),
    );
    if (s.expires <= Date.now()) fail(410, "Paylaşım süresi doldu");
    send(res, required(get("SELECT * FROM files WHERE id=?", s.file)));
  });
  router.delete("/files/:id", (req, res) => {
    run("DELETE FROM files WHERE id=? AND owner=?", req.params.id, req.user.id);
    res.json({ ok: true });
  });
}
