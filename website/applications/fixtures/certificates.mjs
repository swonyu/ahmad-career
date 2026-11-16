import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {X509Certificate} from 'node:crypto';

const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');

/** Creates a private, short-lived CA for one isolated acceptance build. Never installs trust. */
export function fixtureCertificates(runtimeDir) {
  if(!path.isAbsolute(runtimeDir))throw new Error('The fixture runtime directory must be an absolute path outside the source tree.');
  const directory=path.resolve(runtimeDir);
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  if(fs.lstatSync(directory).isSymbolicLink())throw new Error('Fixture runtime cannot be a symlink.');
  const realDirectory=fs.realpathSync(directory),realSourceRoot=fs.realpathSync(sourceRoot);
  if(realDirectory===realSourceRoot||realDirectory.startsWith(realSourceRoot+path.sep))throw new Error('Fixture keys and ledger must stay outside the source tree.');
  fs.chmodSync(directory,0o700);
  const files={caPath:path.join(directory,'ca.pem'),caKeyPath:path.join(directory,'ca.key.pem'),certPath:path.join(directory,'server.pem'),keyPath:path.join(directory,'server.key.pem')};
  const marker=path.join(directory,'certificates.private.json');
  if(!fs.existsSync(marker)) {
    if(Object.values(files).some(file=>fs.existsSync(file)))throw new Error('Incomplete fixture certificates exist. Use a new private runtime directory.');
    const caConfig=path.join(directory,'ca.cnf'),leafConfig=path.join(directory,'server.cnf'),csr=path.join(directory,'server.csr.pem');
    fs.writeFileSync(caConfig,'[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\nCN=Career Finder Isolated Acceptance CA\n[ca]\nbasicConstraints=critical,CA:true,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n',{mode:0o600});
    fs.writeFileSync(leafConfig,'[req]\nprompt=no\ndistinguished_name=dn\nreq_extensions=server\n[dn]\nCN=10.0.2.2\n[server]\nbasicConstraints=critical,CA:false\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:10.0.2.2,IP:127.0.0.1\n',{mode:0o600});
    const run=args=>{
      const result=spawnSync('openssl',args,{cwd:directory,encoding:'utf8',timeout:30000});
      if(result.error||result.status!==0)throw new Error('OpenSSL could not generate the isolated acceptance certificate. Install OpenSSL and use a fresh private runtime directory.');
    };
    const previousMask=process.umask(0o077);
    try {
      run(['req','-x509','-newkey','rsa:2048','-nodes','-sha256','-days','3','-keyout',files.caKeyPath,'-out',files.caPath,'-config',caConfig]);
      run(['req','-new','-newkey','rsa:2048','-nodes','-sha256','-keyout',files.keyPath,'-out',csr,'-config',leafConfig]);
      run(['x509','-req','-in',csr,'-CA',files.caPath,'-CAkey',files.caKeyPath,'-CAcreateserial','-out',files.certPath,'-days','3','-sha256','-extfile',leafConfig,'-extensions','server']);
    } finally {process.umask(previousMask)}
    fs.writeFileSync(marker,JSON.stringify({schemaVersion:1,testOnly:true,createdAt:new Date().toISOString()}),{mode:0o600});
  }
  const metadata=JSON.parse(fs.readFileSync(marker,'utf8'));
  if(metadata.schemaVersion!==1||metadata.testOnly!==true)throw new Error('The directory is not an isolated acceptance certificate runtime.');
  for(const file of Object.values(files)) {
    if(fs.lstatSync(file).isSymbolicLink())throw new Error('Fixture certificate files cannot be symlinks.');
    fs.chmodSync(file,0o600);
  }
  const ca=new X509Certificate(fs.readFileSync(files.caPath)),leaf=new X509Certificate(fs.readFileSync(files.certPath));
  if(!ca.ca||!leaf.verify(ca.publicKey)||!leaf.checkIP('10.0.2.2')||!leaf.checkIP('127.0.0.1')||Date.parse(leaf.validTo)<=Date.now()+5*60000)throw new Error('Fixture certificates expired or do not match. Use a new runtime directory and rebuild only the acceptance variant.');
  return {...files,runtimeDir:directory,caFingerprint256:ca.fingerprint256,expiresAt:new Date(leaf.validTo).toISOString()};
}
