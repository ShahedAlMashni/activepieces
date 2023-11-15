import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { setupApp } from '../../../../src/app/app'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { createMockProject, createMockUser } from '../../../helpers/mocks'
import { generateMockToken } from '../../../helpers/auth'
import { stripeHelper } from '../../../../src/app/ee/billing/stripe/stripe-helper'
import { emailService } from '../../../../src/app/ee/helper/email/email-service'
import { UserStatus } from '@activepieces/shared'
import { faker } from '@faker-js/faker'

let app: FastifyInstance | null = null

beforeAll(async () => {
    await databaseConnection.initialize()
    app = await setupApp()
})

afterAll(async () => {
    await databaseConnection.destroy()
    await app?.close()
})

describe('Project Member API', () => {
    describe('Invite member to project Endpoint', () => {
        it('Adds new invited user', async () => {
            const mockUser = createMockUser()
            await databaseConnection.getRepository('user').save(mockUser)

            const mockPlatformId = faker.string.nanoid(21)
            const mockProject = createMockProject({
                ownerId: mockUser.id,
                platformId: mockPlatformId,
            })
            await databaseConnection.getRepository('project').save(mockProject)

            const mockToken = await generateMockToken({
                id: mockUser.id,
                projectId: mockProject.id,
                platform: {
                    id: mockPlatformId,
                    role: 'OWNER',
                },
            })

            const mockInviteProjectMemberRequest = {
                email: 'test@ap.com',
                role: 'VIEWER',
            }

            stripeHelper.createCustomer = jest.fn().mockResolvedValue(faker.string.uuid())
            emailService.sendInvitation = jest.fn()

            // act
            const response = await app?.inject({
                method: 'POST',
                url: '/v1/project-members/invite',
                headers: {
                    authorization: `Bearer ${mockToken}`,
                },
                body: mockInviteProjectMemberRequest,
            })

            // assert
            const responseBody = response?.json()

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(Object.keys(responseBody)).toHaveLength(1)
            expect(responseBody?.token).toBeDefined()

            const invitedUser = await databaseConnection.getRepository('user').findOneBy({
                email: mockInviteProjectMemberRequest.email,
            })

            expect(invitedUser?.status).toBe('INVITED')
            expect(invitedUser?.platformId).toBe(mockProject.platformId)
        })

        it('Uses existing invited user', async () => {
            const mockProjectOwner = createMockUser()
            const mockInvitedUser = createMockUser({
                status: UserStatus.INVITED,
            })
            await databaseConnection.getRepository('user').save([mockProjectOwner, mockInvitedUser])

            const mockPlatformId = faker.string.nanoid(21)
            const mockProject = createMockProject({
                ownerId: mockProjectOwner.id,
                platformId: mockPlatformId,
            })
            await databaseConnection.getRepository('project').save(mockProject)

            const mockToken = await generateMockToken({
                id: mockProjectOwner.id,
                projectId: mockProject.id,
                platform: {
                    id: mockPlatformId,
                    role: 'OWNER',
                },
            })

            const mockInviteProjectMemberRequest = {
                email: mockInvitedUser.email,
                role: 'VIEWER',
            }

            stripeHelper.createCustomer = jest.fn().mockResolvedValue(faker.string.uuid())
            emailService.sendInvitation = jest.fn()

            // act
            const response = await app?.inject({
                method: 'POST',
                url: '/v1/project-members/invite',
                headers: {
                    authorization: `Bearer ${mockToken}`,
                },
                body: mockInviteProjectMemberRequest,
            })

            // assert
            const responseBody = response?.json()

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(Object.keys(responseBody)).toHaveLength(1)
            expect(responseBody?.token).toBeDefined()

            const invitedUser = await databaseConnection.getRepository('user').findOneBy({
                email: mockInviteProjectMemberRequest.email,
            })

            expect(invitedUser?.id).toBe(mockInvitedUser.id)
        })
    })
})
