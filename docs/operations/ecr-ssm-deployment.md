# Production deployment with ECR and AWS Systems Manager

Production images are built by GitHub Actions. The EC2 instance never runs a
Docker build: it pulls an immutable image tagged with the tested Git commit and
starts only Redis, API, worker, and AI dispatcher. Deployment commands travel
through AWS Systems Manager (SSM), so GitHub does not need an SSH private key.

## One-time AWS preparation

1. Reboot the existing instance if it accepts TCP connections but SSH, HTTP,
   and TLS do not return application data. Wait for both EC2 status checks.
2. Create a private ECR repository named `coditent-api` in the instance region.
   Enable scan-on-push and immutable tags, and add a lifecycle policy that
   retains the latest 20 commit-tagged images.
3. Attach an instance profile to EC2 with:
   - AWS managed policy `AmazonSSMManagedInstanceCore`.
   - Permission to call `ecr:GetAuthorizationToken`.
   - `ecr:BatchCheckLayerAvailability`, `ecr:GetDownloadUrlForLayer`, and
     `ecr:BatchGetImage` on the `coditent-api` repository.
4. Confirm the SSM agent reports the instance as **Online** in Systems Manager
   → Fleet Manager. Ubuntu AWS images normally include the agent.
5. Ensure `aws`, Docker Engine, and Docker Compose v2 are installed. The
   Ansible setup playbook now includes the AWS CLI.

The EC2 instance role—not stored credentials—authenticates Docker to ECR.

## GitHub OIDC deployment role

Create an IAM role trusted by GitHub's OIDC provider. Restrict its trust policy
to this repository's `main` branch:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:aelasefa/coditent:ref:refs/heads/main"
      }
    }
  }]
}
```

Grant that role the following deployment policy, replacing the placeholders:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:CompleteLayerUpload",
        "ecr:DescribeImages",
        "ecr:GetDownloadUrlForLayer",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart"
      ],
      "Resource": "arn:aws:ecr:<REGION>:<ACCOUNT_ID>:repository/coditent-api"
    },
    {
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ssm:<REGION>::document/AWS-RunShellScript",
        "arn:aws:ec2:<REGION>:<ACCOUNT_ID>:instance/<INSTANCE_ID>"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "ssm:DescribeInstanceInformation",
        "ssm:GetCommandInvocation"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "sts:GetCallerIdentity",
      "Resource": "*"
    }
  ]
}
```

The policy permits commands only against the production instance using the
AWS-managed `AWS-RunShellScript` document.

## GitHub configuration

In repository Settings → Secrets and variables → Actions, configure:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `AWS_DEPLOY_ROLE_ARN` | ARN of the GitHub OIDC role |
| Variable | `AWS_REGION` | For example `us-east-1` |
| Variable | `ECR_REPOSITORY` | `coditent-api` |
| Variable | `EC2_INSTANCE_ID` | The production `i-...` instance ID |
| Secret | `PUBLIC_BASE_URL` | `https://api.coditent.app` |

`EC2_SSH_KEY`, `EC2_SSH_KNOWN_HOSTS`, `EC2_HOST`, and `EC2_USER` are no longer
used by the production workflow. Remove them only after an SSM deployment has
completed successfully.

## Deployment and rollback behavior

Every push to `main` runs tests, builds `apps/api/Dockerfile` on GitHub's
runner, and pushes:

```text
<account>.dkr.ecr.<region>.amazonaws.com/coditent-api:<40-character-commit>
```

SSM then checks out that exact commit on EC2 and runs
`scripts/deploy-production-image.sh`. The script authenticates through the
instance role, pulls the image, starts the backend without building, and waits
for `/ready`. It records the previous image and restores it if readiness fails.
Database migrations must remain backward-compatible with the previous release
for automatic application rollback to be safe.

After the first successful SSM deployment, remove public inbound access to TCP
22 from the EC2 security group. Keep ports 80 and 443 public.

