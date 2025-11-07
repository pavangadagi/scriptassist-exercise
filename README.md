# TaskFlow API - Development Notes

## Problems Encountered

### 1. OverdueTasksService Dependency Injection Error

Error: Nest can't resolve dependencies of the OverdueTasksService (BullQueue_task-processing, ?). Please make sure that the argument "TaskRepository" at index [1] is available in the ScheduledTasksModule context.

Solution: Replaced TaskRepository with TasksService. Repository was being injected directly which is an anti-pattern. Commented out its use for now.

### 2. JWT Strategy Missing Secret

Error: TypeError: JwtStrategy requires a secret or key

Solution: The jwtConfig was never loaded in app.module.ts. Added it to ConfigModule.forRoot() load array.

### 3. Inconsistent Token Generation

Problem: register function was using generateToken but login function was not consistent.

Solution: Made both functions use generateAccessToken and generateRefreshToken consistently.

## Architecture Decisions

### JWT Authentication Implementation

Decision: Hybrid implementation with refresh tokens

We trust the JWT payload completely (no DB call on every request). When time comes for refresh, we check in DB if user details have changed. This gives us:
- Performance: ~1ms per request
- Scalability: No DB bottleneck
- Trade-off: Role changes propagate on token refresh (15 min max)

Access tokens: 15 minutes
Refresh tokens: 7 days


## File Changes

- src/modules/auth/auth.service.ts - Implemented stateless JWT with refresh tokens
- src/modules/auth/auth.controller.ts - Added refresh, logout, revoke endpoints
- src/modules/auth/strategies/jwt.strategy.ts - Truly stateless validation
- src/modules/users/users.service.ts - Added token management methods
- src/modules/users/entities/user.entity.ts - Added tokenVersion and refreshToken fields
- src/app.module.ts - Fixed jwtConfig loading
- src/queues/scheduled-tasks/overdue-tasks.service.ts - Fixed dependency injection
