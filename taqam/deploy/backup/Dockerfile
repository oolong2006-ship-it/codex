# صورة النسخ الاحتياطي: نفس إصدار PostgreSQL في قاعدة البيانات (pg_dump يجب ألا يكون أقدم من الخادم)
# + أدوات النسخ الخارجي الاختياري (rclone للرفع إلى S3/Spaces، و gnupg للتشفير، و curl لرابط النبض).
# تُبنى مرة واحدة مع deploy.sh، فلا تعتمد إعادة تشغيل الحاوية على الإنترنت.
FROM postgres:16-alpine
RUN apk add --no-cache rclone gnupg curl \
 && rclone version | head -n 1 && gpg --version | head -n 1
