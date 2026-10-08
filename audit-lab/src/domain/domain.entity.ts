import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/* -------------------------------------------------------------------------- */
/*                                   ENUMS                                    */
/* -------------------------------------------------------------------------- */

export enum ProjectRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum RequirementStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  READY = 'READY',
  IMPLEMENTED = 'IMPLEMENTED',
}

export enum PullRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/* -------------------------------------------------------------------------- */
/*                                    USER                                    */
/* -------------------------------------------------------------------------- */

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  username: string;

  @Column({ length: 255 })
  passwordHash: string;

  @Column({ length: 100 })
  displayName: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Project, (project: Project) => project.createdBy)
  createdProjects: Project[];

  @OneToMany(() => ProjectMember, (member: ProjectMember) => member.user)
  memberships: ProjectMember[];

  @OneToMany(
    () => Requirement,
    (requirement: Requirement) => requirement.createdBy,
  )
  createdRequirements: Requirement[];

  @OneToMany(
    () => PullRequest,
    (pullRequest: PullRequest) => pullRequest.author,
  )
  pullRequests: PullRequest[];

  @OneToMany(
    () => PullRequest,
    (pullRequest: PullRequest) => pullRequest.approver,
  )
  approvedPullRequests: PullRequest[];
}

/* -------------------------------------------------------------------------- */
/*                                   PROJECT                                  */
/* -------------------------------------------------------------------------- */

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ default: false })
  isPrivate: boolean;

  @ManyToOne(
    () => User,
    (user: User) => user.createdProjects,
    {
      nullable: false,
    },
  )
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(
    () => ProjectMember,
    (member: ProjectMember) => member.project,
  )
  members: ProjectMember[];

  @OneToMany(
    () => Requirement,
    (requirement: Requirement) => requirement.project,
  )
  requirements: Requirement[];
}

/* -------------------------------------------------------------------------- */
/*                              PROJECT MEMBER                                */
/* -------------------------------------------------------------------------- */

@Entity('project_members')
@Unique(['project', 'user'])
export class ProjectMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(
    () => Project,
    (project: Project) => project.members,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @ManyToOne(
    () => User,
    (user: User) => user.memberships,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: ProjectRole,
  })
  role: ProjectRole;

  @CreateDateColumn()
  createdAt: Date;
}

/* -------------------------------------------------------------------------- */
/*                                REQUIREMENT                                 */
/* -------------------------------------------------------------------------- */

@Entity('requirements')
export class Requirement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(
    () => Project,
    (project: Project) => project.requirements,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: RequirementStatus,
    default: RequirementStatus.DRAFT,
  })
  status: RequirementStatus;

  @ManyToOne(
    () => User,
    (user: User) => user.createdRequirements,
    {
      nullable: false,
    },
  )
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(
    () => PullRequest,
    (pullRequest: PullRequest) => pullRequest.requirement,
  )
  pullRequests: PullRequest[];
}

/* -------------------------------------------------------------------------- */
/*                               PULL REQUEST                                 */
/* -------------------------------------------------------------------------- */

@Entity('pull_requests')
export class PullRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(
    () => Requirement,
    (requirement: Requirement) => requirement.pullRequests,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'requirement_id' })
  requirement: Requirement;

  @ManyToOne(
    () => User,
    (user: User) => user.pullRequests,
    {
      nullable: false,
    },
  )
  @JoinColumn({ name: 'author_id' })
  author: User;

  @ManyToOne(
    () => User,
    (user: User) => user.approvedPullRequests,
    {
      nullable: true,
    },
  )
  @JoinColumn({ name: 'approver_id' })
  approver: User | null;

  @Column({
    type: 'enum',
    enum: PullRequestStatus,
    default: PullRequestStatus.PENDING,
  })
  status: PullRequestStatus;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  rejectedAt: Date | null;
}