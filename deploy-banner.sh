#!/bin/bash
cd /Users/test/Desktop/sport/website-sfi-novo
cp /tmp/banner-email.jpg img/banner-email-b2b.jpg
git add img/banner-email-b2b.jpg
git commit -m "Add B2B email banner image"
git push origin main
echo "DONE"
