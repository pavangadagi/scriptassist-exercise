# Candidate Evaluation Guide

This document provides structured guidelines for evaluating candidate submissions to the TaskFlow API coding exercise.

## Evaluation Process

1. **Initial Code Review**: Review the code for overall structure, organization, and completeness.
2. **Functionality Testing**: Test the implemented features for correctness.
3. **Code Quality Assessment**: Evaluate code against quality metrics.
4. **Documentation Review**: Assess API and code documentation.
5. **Interview Discussion**: Use the submission as a basis for technical discussion during interviews.

## Evaluation Criteria

### 1. Task Module Implementation (25 points)

| Criteria | Points | Description |
|----------|--------|-------------|
| CRUD Operations | 10 | All CRUD operations are correctly implemented |
| Input Validation | 5 | Proper validation using class-validator and pipes |
| Filtering & Pagination | 5 | Effective implementation of filtering and pagination |
| Error Handling | 5 | Robust error handling in controller and service |

#### Notes for Reviewers:
- Check if all endpoints return proper status codes
- Verify that validation is working correctly
- Test pagination and filtering with different parameters
- Check how edge cases are handled

### 2. Background Processing (20 points)

| Criteria | Points | Description |
|----------|--------|-------------|
| Task Processor Implementation | 10 | Correct implementation of the BullMQ processor |
| Scheduled Tasks | 5 | Implementation of the overdue tasks notifier |
| Error Handling in Queues | 5 | Proper handling of errors in queue processing |

#### Notes for Reviewers:
- Check if the processor correctly updates task statuses
- Verify that the scheduled task works as expected
- Test error scenarios in queue processing
- Check for race conditions and concurrency issues

### 3. API Security (15 points)

| Criteria | Points | Description |
|----------|--------|-------------|
| Rate Limiting | 5 | Effective implementation of rate limiting |
| Authentication | 5 | Proper use of JWT authentication |
| Authorization | 5 | Correct implementation of role-based access control |

#### Notes for Reviewers:
- Test rate limiting by making multiple requests
- Verify that authenticated endpoints reject unauthenticated requests
- Check if role-based access control works correctly

### 4. Testing (15 points)

| Criteria | Points | Description |
|----------|--------|-------------|
| Test Coverage | 5 | Comprehensive test coverage of key functionality |
| Test Quality | 5 | Effective use of mocks, stubs, and test setup |
| Edge Case Testing | 5 | Tests include edge cases and error scenarios |

#### Notes for Reviewers:
- Run the test suite with `bun test` and check for passing tests
- Evaluate the quality and structure of the tests
- Check if edge cases and error scenarios are tested

### 5. Documentation (10 points)

| Criteria | Points | Description |
|----------|--------|-------------|
| API Documentation | 5 | Comprehensive Swagger documentation |
| Code Documentation | 5 | Clear comments and documentation in the code |

#### Notes for Reviewers:
- Check if all endpoints are documented in Swagger
- Verify that complex code has appropriate comments
- Assess the overall clarity of the documentation

### 6. Code Quality (15 points)

| Criteria | Points | Description |
|----------|--------|-------------|
| TypeScript Usage | 5 | Proper use of TypeScript features and type safety |
| Code Organization | 5 | Clean, readable, and maintainable code |
| Performance Considerations | 5 | Attention to performance and scalability |

#### Notes for Reviewers:
- Check for proper typing and avoidance of `any`
- Evaluate code organization and adherence to best practices
- Look for performance optimizations and scalability considerations

## Bonus Points (10 points)

| Criteria | Points | Description |
|----------|--------|-------------|
| Additional Features | 5 | Implementation of useful features beyond requirements |
| Improvements to Base Code | 5 | Thoughtful improvements to the provided code |

#### Notes for Reviewers:
- Evaluate any additional features for their usefulness and implementation quality
- Consider thoughtful improvements to the base code that weren't explicitly required

## Total Score

The maximum possible score is 110 points (100 base + 10 bonus).

| Score Range | Evaluation |
|-------------|------------|
| 90-110 | Excellent candidate, highly recommended |
| 80-89 | Strong candidate, recommended |
| 70-79 | Good candidate, consider for further rounds |
| 60-69 | Average candidate, may need additional evaluation |
| Below 60 | Not recommended |

## Interview Follow-up Questions

Use these questions during the interview to discuss the candidate's submission:

1. **Architecture Decisions**: "Can you explain your approach to implementing the task processor?"
2. **Technical Challenges**: "What was the most challenging part of the exercise and how did you overcome it?"
3. **Alternative Approaches**: "What alternative approaches did you consider for implementing filtering and pagination?"
4. **Performance**: "How would you optimize the application for a large number of tasks and users?"
5. **Scaling**: "How would you modify the application to handle high load?"
6. **Security**: "What additional security measures would you implement in a production environment?"
7. **Error Handling**: "Can you explain your approach to error handling in the application?"
8. **Testing**: "How would you improve the test coverage of the application?"

## Final Recommendation

The final recommendation should consider the numerical score as well as a holistic assessment of the candidate's:
- Problem-solving approach
- Code structure and organization
- Attention to detail
- Communication in code and documentation
- Technical depth demonstrated in the implementation 