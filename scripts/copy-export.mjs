import {cpSync,rmSync} from 'node:fs';
rmSync('out',{recursive:true,force:true});
cpSync('web/out','out',{recursive:true});
