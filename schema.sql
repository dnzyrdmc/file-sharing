-- Referans şema: uygulama açılışında IF NOT EXISTS ile oluşturulur.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,owner TEXT REFERENCES users(id),name TEXT,size INTEGER,total INTEGER,status TEXT DEFAULT 'uploading',created_at TEXT);
 CREATE TABLE IF NOT EXISTS chunks(file TEXT REFERENCES files(id) ON DELETE CASCADE,part INTEGER,data BLOB,PRIMARY KEY(file,part));
 CREATE TABLE IF NOT EXISTS shares(token_hash TEXT PRIMARY KEY,file TEXT REFERENCES files(id) ON DELETE CASCADE,expires INTEGER);
