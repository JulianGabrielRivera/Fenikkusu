import mongoose from 'mongoose'

const MONGO_URI = process.env.MONGO_URI;

declare global{
    var mongooseCache:{
        conn: typeof mongoose | null;
        promise: Promise<typeof mongoose> | null;
    }
}

let cached = global.mongooseCache;

if(!cached){
    cached = global.mongooseCache = {conn:null,promise: null};
}

export const connectToDatabase = async()=>{
    if(!MONGO_URI) throw new Error('MONGO_URI must be set within .env');

    if(cached.conn) return cached.conn;

    if(!cached.promise){
        cached.promise = mongoose.connect(MONGO_URI, {bufferCommands:false});
    }
        try{
        cached.conn = await cached.promise

        }
        catch(error){
            cached.promise = null;
            throw error;
        }
        console.log(`Connected to database ${process.env.NODE_ENV} - ${MONGO_URI}`);
            return cached.conn;

    }
