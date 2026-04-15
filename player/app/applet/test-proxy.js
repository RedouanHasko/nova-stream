import http from 'http';

http.get('http://localhost:3000/api/proxy?url=http%3A%2F%2Fline.dndnscloud.ru%2Fmovie%2Fbeff5baba4%2Fb293e5db9467%2F1309725.ts', (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', res.headers);
  res.destroy();
}).on('error', (err) => {
  console.log('Error:', err.message);
});
