FROM nginx:1.27-alpine
COPY deployinn-nginx.conf /etc/nginx/conf.d/default.conf
RUN echo "resolver 8.8.8.8 valid=30s ipv6=off;" > /etc/nginx/deployinn-resolver.conf
COPY deployinn-resolver.sh /docker-entrypoint.d/40-deployinn-resolver.sh
RUN chmod +x /docker-entrypoint.d/40-deployinn-resolver.sh
COPY . /usr/share/nginx/html
RUN rm -f /usr/share/nginx/html/Dockerfile /usr/share/nginx/html/.dockerignore /usr/share/nginx/html/deployinn-nginx.conf /usr/share/nginx/html/deployinn-resolver.sh
EXPOSE 80
