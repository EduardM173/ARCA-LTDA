import {PrismaClient} from '../generated/client';
export const db=new PrismaClient({transactionOptions:{maxWait:15000,timeout:20000}});
