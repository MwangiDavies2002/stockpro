const router = require('express').Router();
const crypto = require('crypto');
const { query, getClient } = require('../config/db');
const { authenticate, adminOnly } = require('../middleware/auth');
const { getBusinessId } = require('../utils/tenant');
router.use(authenticate, adminOnly);
router.get('/', async (req,res,next) => {
  try { const {rows} = await query('SELECT * FROM owner_network_members WHERE business_id=?',[getBusinessId(req)]); res.json(rows[0] || null); } catch(e) { next(e); }
});
router.post('/', async (req,res,next) => {
  const {region,segment} = req.body;
  if (typeof region !== 'string' || typeof segment !== 'string' || !region.trim() || !segment.trim() || region.length>80 || segment.length>80 || typeof req.body.optedIn !== 'boolean') return res.status(400).json({message:'Region, business type and explicit consent are required.'});
  try {
    await query(`INSERT INTO owner_network_members (business_id,region,segment,opted_in) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE region=VALUES(region),segment=VALUES(segment),opted_in=VALUES(opted_in)`,[getBusinessId(req),region.trim().toLowerCase(),segment.trim().toLowerCase(),req.body.optedIn]);
    res.json({message:'Preferences saved. Verification is administered separately.'});
  } catch(e) { next(e); }
});
router.post('/invite', async (req,res,next) => {
  try {
    const id=getBusinessId(req);
    const {rows}=await query('SELECT business_id FROM owner_network_members WHERE business_id=? AND verified=TRUE AND opted_in=TRUE',[id]);
    if (!rows.length) return res.status(403).json({message:'Verified membership is required to issue invitations.'});
    const code=crypto.randomBytes(24).toString('hex');
    await query('INSERT INTO owner_network_invites (code_hash,business_id,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 7 DAY))',[crypto.createHash('sha256').update(code).digest('hex'),id]);
    res.status(201).json({code, expiresInDays:7});
  } catch(e) {next(e);}
});
router.post('/redeem', async(req,res,next) => {
  if(typeof req.body.code !== 'string' || !/^[a-f0-9]{48}$/.test(req.body.code)) return res.status(400).json({message:'Invalid invitation'});
  let client;
  try {
    client=await getClient(); await client.query('START TRANSACTION');
    const {rows}=await client.query('SELECT * FROM owner_network_invites WHERE code_hash=? AND used_by IS NULL AND expires_at>NOW() FOR UPDATE',[crypto.createHash('sha256').update(req.body.code).digest('hex')]);
    if(!rows.length || rows[0].business_id===getBusinessId(req)) {await client.query('ROLLBACK'); return res.status(400).json({message:'Invitation unavailable'});}
    const member=await client.query('SELECT business_id FROM owner_network_members WHERE business_id=?',[getBusinessId(req)]);
    if(!member.rows.length) {await client.query('ROLLBACK'); return res.status(400).json({message:'Save your business profile first'});}
    await client.query('UPDATE owner_network_invites SET used_by=? WHERE code_hash=?',[getBusinessId(req),rows[0].code_hash]);
    await client.query('COMMIT'); res.json({message:'Invitation accepted. Business verification is still required.'});
  } catch(e) {if(client) await client.query('ROLLBACK');next(e);} finally {client?.release();}
});
module.exports=router;
