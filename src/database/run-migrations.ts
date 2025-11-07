import { DataSource } from 'typeorm';
import dataSource from './data-source';

async function runMigrations() {
  console.log('Starting migration process...');
  
  try {
    // Initialize connection
    await dataSource.initialize();
    console.log('Database connection initialized successfully.');
    
    // Log pending migrations
    const pendingMigrations = await dataSource.showMigrations();
    console.log(`Pending migrations: ${pendingMigrations ? 'Yes' : 'No'}`);
    
    // Run migrations
    console.log('Running migrations...');
    const migrations = await dataSource.runMigrations({ transaction: 'all' });
    
    console.log(`Executed ${migrations.length} migrations:`);
    migrations.forEach(migration => console.log(`- ${migration.name}`));

    if (migrations.length === 0) {
      console.log('No migrations were executed. Creating tables directly...');
      
      // Option to force table creation if no migrations ran
      console.log('Creating users table...');
      await dataSource.query(`
        CREATE TABLE IF NOT EXISTS "users" (
          "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          "email" varchar NOT NULL UNIQUE,
          "name" varchar NOT NULL,
          "password" varchar NOT NULL,
          "role" varchar NOT NULL DEFAULT 'user',
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now()
        )
      `);
      
      console.log('Creating tasks table...');
      await dataSource.query(`
        CREATE TABLE IF NOT EXISTS "tasks" (
          "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          "title" varchar NOT NULL,
          "description" text,
          "status" varchar NOT NULL DEFAULT 'PENDING',
          "priority" varchar NOT NULL DEFAULT 'MEDIUM',
          "due_date" TIMESTAMP,
          "user_id" uuid NOT NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "fk_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
        )
      `);
      
      console.log('Tables created successfully.');
    }
  } catch (error) {
    console.error('Error running migrations:', error);
  } finally {
    // Close connection
    if (dataSource.isInitialized) {
      await dataSource.destroy();
      console.log('Database connection closed.');
    }
  }
}

runMigrations()
  .then(() => console.log('Migration process completed.'))
  .catch(error => console.error('Unhandled error:', error)); 