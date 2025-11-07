import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { User } from '../../modules/users/entities/user.entity';
import { Task } from '../../modules/tasks/entities/task.entity';
import { users } from './seed-data/users.seed';
import { tasks } from './seed-data/tasks.seed';

// Load environment variables
config();

// Define the data source
const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'taskflow',
  entities: [User, Task],
  synchronize: false,
});

// Initialize and seed database
async function main() {
  try {
    // Initialize connection
    await AppDataSource.initialize();
    console.log('Database connection initialized');

    // Clear existing data
    await AppDataSource.getRepository(Task).delete({});
    await AppDataSource.getRepository(User).delete({});
    console.log('Existing data cleared');

    // Seed users
    await AppDataSource.getRepository(User).save(users);
    console.log('Users seeded successfully');

    // Seed tasks
    await AppDataSource.getRepository(Task).save(tasks);
    console.log('Tasks seeded successfully');

    console.log('Database seeding completed');
  } catch (error) {
    console.error('Error during database seeding:', error);
  } finally {
    // Close connection
    await AppDataSource.destroy();
    console.log('Database connection closed');
  }
}

// Run the seeding
main(); 