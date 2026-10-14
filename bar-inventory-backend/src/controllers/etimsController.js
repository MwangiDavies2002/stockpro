const { query } = require('../config/db');
const { getBusinessId } = require('../utils/tenant');
const {encrypt}=require('../utils/secrets');

exports.getConfig = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT kra_pin, etims_enabled, etims_mode, etims_api_url, etims_username, etims_device_serial,etims_branch_id,etims_last_invoice_no,etims_initialized
       FROM businesses WHERE id=?`, [getBusinessId(req)]
    );
    if (!rows.length) return res.status(404).json({ message: 'Shop not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

exports.updateConfig = async (req, res, next) => {
  try {
    const mode = req.body.mode || 'sandbox';
    if (!['sandbox', 'production'].includes(mode)) return res.status(400).json({ message: 'Invalid eTIMS mode' });
    const lastInvoice=Number(req.body.lastInvoiceNo??0);
    if(!Number.isInteger(lastInvoice)||lastInvoice<0)return res.status(400).json({message:'Last KRA invoice number must be a non-negative whole number'});
    if(req.body.apiUrl){const url=new URL(req.body.apiUrl);if(url.protocol!=='https:'||!['etims-api.kra.go.ke','etims-sbx.kra.go.ke','etims.kra.go.ke'].includes(url.hostname))return res.status(400).json({message:'Use an official KRA HTTPS API URL'});}
    const {rows:[previous]}=await query('SELECT * FROM businesses WHERE id=?',[getBusinessId(req)]);
    if(previous?.etims_initialized&&((req.body.kraPin||null)!==previous.kra_pin||(req.body.deviceSerial||null)!==previous.etims_device_serial||(req.body.branchId||'00')!==previous.etims_branch_id||mode!==previous.etims_mode||(req.body.apiUrl||null)!==previous.etims_api_url))return res.status(409).json({message:'This KRA device is already initialized. Device or environment changes require a controlled re-registration.'});
    await query(
      `UPDATE businesses SET kra_pin=?, etims_enabled=?, etims_mode=?, etims_api_url=?,
       etims_username=?, etims_password_encrypted=COALESCE(?,etims_password_encrypted),etims_device_serial=?,etims_branch_id=?,etims_last_invoice_no=GREATEST(etims_last_invoice_no,?) WHERE id=?`,
      [req.body.kraPin || null, !!req.body.enabled, mode, req.body.apiUrl || null,
        req.body.username || null, encrypt(req.body.password), req.body.deviceSerial||null,req.body.branchId||'00',lastInvoice,getBusinessId(req)]
    );
    res.json({ message: 'eTIMS configuration saved', mode, enabled: !!req.body.enabled });
  } catch (err) { next(err); }
};
exports.initialize=async(req,res,next)=>{try{res.json(await require('../services/etims').initialize(getBusinessId(req)));}catch(error){next(error);}};
exports.jobs=async(req,res,next)=>{try{res.json((await query("SELECT id,reference_id,status,attempts,last_error,created_at FROM integration_jobs WHERE business_id=? AND provider='kra-etims' ORDER BY id DESC",[getBusinessId(req)])).rows);}catch(error){next(error);}};
exports.submit=async(req,res,next)=>{try{res.json(await require('../services/etims').submit(Number(req.params.id),getBusinessId(req)));}catch(error){next(error);}};
exports.mapItem=async(req,res,next)=>{try{
  const fields=['itemCode','classCode','taxCategory','qtyUnit','pkgUnit'];
  const lengths={itemCode:60,classCode:20,taxCategory:5,qtyUnit:5,pkgUnit:5};
  if(fields.some(key=>typeof req.body[key]!=='string'||!req.body[key].trim()||req.body[key].length>lengths[key])||!['A','B','C','D','E'].includes(req.body.taxCategory))return res.status(400).json({message:'Enter valid registered KRA item, classification, tax and unit codes'});
  const result=await query('UPDATE inventory_items SET etims_item_code=?,etims_class_code=?,etims_tax_category=?,etims_qty_unit=?,etims_pkg_unit=? WHERE id=? AND business_id=?',[...fields.map(key=>req.body[key].trim()),req.params.id,getBusinessId(req)]);
  if(!result.rowCount)return res.status(404).json({message:'Product not found'});
  res.json({message:'KRA product mapping saved'});
}catch(error){next(error);}};

