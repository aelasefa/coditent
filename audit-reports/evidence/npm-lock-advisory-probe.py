# Audit-only npm Bulk Advisory API query of checked-in npm package-lock versions.
# No installation, fixes, or application mutations. Sends only public package/version names.
from pathlib import Path
import json,urllib.request
base=Path('/home/maelmahf/Desktop/coditent'); lock=base/'apps/web/package-lock.json'; parsed=json.loads(lock.read_text()); packages={}
for path,item in parsed.get('packages',{}).items():
 if not path or '/node_modules/' not in '/'+path:continue
 name=item.get('name') or path.rsplit('node_modules/',1)[-1];version=item.get('version')
 if not version or item.get('link'):continue
 packages.setdefault(name,set()).add(version)
payload={name:sorted(versions) for name,versions in packages.items()}
request=urllib.request.Request('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',data=json.dumps(payload).encode(),method='POST',headers={'Content-Type':'application/json','User-Agent':'Coditent-audit-only/1.0'})
try:
 with urllib.request.urlopen(request,timeout=30) as response: advisories=json.load(response); status=response.status
 result={'command':'python3 audit-reports/evidence/npm-lock-advisory-probe.py','authority':'npm Registry Bulk Advisory API','url':'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk','lockfile':'apps/web/package-lock.json','http_status':status,'package_count':len(packages),'queried_versions':payload,'advisories':advisories,'limitation':'Direct lock-version advisory query; not npm CLI meta-vulnerability graph or proof of installed versions/provider registry completeness.'}
 print(json.dumps({'http_status':status,'package_count':len(packages),'advisory_package_count':len(advisories),'severity_counts':{severity:sum(item.get('severity')==severity for items in advisories.values() for item in items) for severity in ['critical','high','moderate','low']}},indent=2))
except Exception as error:
 result={'command':'python3 audit-reports/evidence/npm-lock-advisory-probe.py','error_type':type(error).__name__,'error':str(error)};print(json.dumps(result));raise
finally:
 (base/'audit-reports/evidence/frontend-npm-lock-advisories.json').write_text(json.dumps(result,indent=2)+'\n')
