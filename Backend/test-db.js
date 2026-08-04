const { Client } = require('pg');

async function test(host) {
  const client = new Client({
    connectionString: `postgresql://postgres.nhittvkskzwpeinscxir:hm7yIIwoMxcKQNuM@${host}:6543/postgres`
  });
  try {
    await client.connect();
    console.log('SUCCESS: ' + host);
    await client.end();
  } catch (err) {
    console.log('FAILED: ' + host + ' - ' + err.message);
  }
}

async function run() {
  await test('aws-0-eu-west-2.pooler.supabase.com');
  await test('aws-1-eu-west-2.pooler.supabase.com');
  
  // also test direct connection
  const client2 = new Client({
    connectionString: `postgresql://postgres:hm7yIIwoMxcKQNuM@db.nhittvkskzwpeinscxir.supabase.co:5432/postgres`
  });
  try {
    await client2.connect();
    console.log('SUCCESS: db.nhittvkskzwpeinscxir.supabase.co');
    await client2.end();
  } catch (err) {
    console.log('FAILED: db.nhittvkskzwpeinscxir.supabase.co - ' + err.message);
  }
}
run();
