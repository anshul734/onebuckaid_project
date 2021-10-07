var mongoose=require('mongoose');

const userSchema=new mongoose.Schema({
    name:String,
    userid:String,
    email:String,
    usercount:{type:Number,default:0},
    photo:String,
    history : [{_id:false,id:String,date:String}]
});

const donor=new mongoose.model("donor",userSchema);
module.exports=donor;