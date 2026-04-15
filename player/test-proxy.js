const axios = require('axios');

async function test() {
  try {
    const res = await axios.get('http://localhost:3000/api/proxy?url=http%3A%2F%2Fline.dndnscloud.ru%2Fmovie%2Fbeff5baba4%2Fb293e5db9467%2F1309725.ts', {
      headers: {
        'Range': 'bytes=0-100'
      }
    });
    console.log('Status:', res.status);
    console.log('Headers:', res.headers);
  } catch (err) {
    console.log('Error:', err.message);
    if (err.response) {
      console.log('Status:', err.response.status);
      console.log('Headers:', err.response.headers);
    }
  }
}

test();
