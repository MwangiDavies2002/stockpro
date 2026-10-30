const { query } = require('../config/db');
const { getBusinessId } = require('../utils/tenant');

const publicFields = `i.id,i.name,i.category,i.brand,i.unit,i.price,i.image_url,i.stock,
  ml.description,ml.whatsapp_phone,b.name AS seller_name,b.city AS seller_city,b.country AS seller_country,b.currency`;

async function search(req,res,next){
  try{
    const term=String(req.query.q||'').trim().slice(0,100);
    const like=`%${term.replace(/[\\%_]/g,'\\$&')}%`;
    const {rows}=await query(`SELECT ${publicFields} FROM marketplace_listings ml
      JOIN inventory_items i ON i.id=ml.inventory_item_id AND i.business_id=ml.business_id
      JOIN businesses b ON b.id=ml.business_id
      WHERE ml.published=TRUE AND i.stock>0 AND i.not_for_selling=FALSE
      AND (?='' OR i.name LIKE ? OR i.category LIKE ? OR i.brand LIKE ? OR b.name LIKE ? OR ml.description LIKE ?)
      ORDER BY ml.updated_at DESC LIMIT 60`,[term,like,like,like,like,like]);
    res.set('Cache-Control','public, max-age=30, stale-while-revalidate=120');res.json(rows);
  }catch(err){next(err);}
}

async function getPublic(req,res,next){
  try{
    const id=Number(String(req.params.id).split('-')[0]);
    if(!Number.isSafeInteger(id)||id<1)return res.status(404).json({message:'Product not found'});
    const {rows}=await query(`SELECT ${publicFields} FROM marketplace_listings ml
      JOIN inventory_items i ON i.id=ml.inventory_item_id AND i.business_id=ml.business_id
      JOIN businesses b ON b.id=ml.business_id
      WHERE ml.published=TRUE AND i.stock>0 AND i.not_for_selling=FALSE AND i.id=? LIMIT 1`,[id]);
    if(!rows[0])return res.status(404).json({message:'Product not found'});
    res.set('Cache-Control','public, max-age=30, stale-while-revalidate=120');res.json(rows[0]);
  }catch(err){next(err);}
}

async function manageList(req,res,next){
  try{
    const {rows}=await query(`SELECT i.id,i.name,i.sku,i.category,i.brand,i.unit,i.stock,i.price,i.image_url,
      i.not_for_selling,ml.description,ml.whatsapp_phone,ml.published
      FROM inventory_items i LEFT JOIN marketplace_listings ml ON ml.inventory_item_id=i.id AND ml.business_id=i.business_id
      WHERE i.business_id=? ORDER BY i.name`,[getBusinessId(req)]);
    res.json(rows);
  }catch(err){next(err);}
}

async function save(req,res,next){
  try{
    const bid=getBusinessId(req),id=Number(req.params.itemId);
    const description=String(req.body.description||'').trim();
    const phone=String(req.body.whatsappPhone||'').replace(/[\s().-]/g,'');
    const published=!!req.body.published;
    if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({message:'Choose a valid inventory product'});
    if(description.length>3000)return res.status(400).json({message:'Product details must be 3,000 characters or fewer'});
    if(!/^\+?[1-9]\d{7,14}$/.test(phone))return res.status(400).json({message:'Enter a valid WhatsApp number with country code, for example +254712345678'});
    const {rows}=await query('SELECT id FROM inventory_items WHERE id=? AND business_id=?',[id,bid]);
    if(!rows[0])return res.status(404).json({message:'Inventory product not found in this business'});
    await query(`INSERT INTO marketplace_listings(business_id,inventory_item_id,description,whatsapp_phone,published)
      VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE description=VALUES(description),whatsapp_phone=VALUES(whatsapp_phone),published=VALUES(published)`,[bid,id,description||null,phone,published]);
    res.json({saved:true,itemId:id,published});
  }catch(err){next(err);}
}

module.exports={search,getPublic,manageList,save};
