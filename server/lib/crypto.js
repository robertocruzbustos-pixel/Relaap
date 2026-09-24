import crypto from 'node:crypto'
import { config } from '../config.js'

// AES-256-GCM para guardar de forma cifrada la API key que carga cada relator.
const key = crypto.createHash('sha256').update(config.appSecret).digest()

export function encrypt(plain) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.')
}

export function decrypt(payload) {
  try {
    const [iv, tag, data] = payload.split('.').map((s) => Buffer.from(s, 'base64'))
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
