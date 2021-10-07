var mongoose=require('mongoose');
const receiverSchema=new mongoose.Schema({
    name:String,
    Account_Number:String,
    IFSC_Code:String,
    Bank:String,
    Branch:String,
    UPI_ID:String,
    trending:Boolean,
    photo:String
})

const receiver=new mongoose.model("receiver",receiverSchema);
module.exports=receiver;