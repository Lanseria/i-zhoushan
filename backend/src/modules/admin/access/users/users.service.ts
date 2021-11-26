import {
  InternalServerErrorException,
  RequestTimeoutException,
  NotFoundException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  ChangePasswordRequestDto,
  CreateUserRequestDto,
  UpdateUserRequestDto,
  UserResponseDto,
} from './dtos';
import {
  InvalidCurrentPasswordException,
  ForeignKeyConflictException,
  UserExistsException,
} from '@common/exeptions';
import { PaginationRequest } from '@common/interfaces';
import { PaginationResponseDto } from '@common/dtos';
import { UsersRepository } from './users.repository';
import { InjectRepository } from '@nestjs/typeorm';
import { HashHelper, Pagination } from '@helpers';
import { DBErrorCode } from '@common/enums';
import { UserMapper } from './users.mapper';
import { TimeoutError } from 'rxjs';
import { UpdateUserInfoDto } from './dtos/update-user-info.dto';
import { CreateUserBaseRequestDto } from './dtos/create-user-request.dto';
import { UserStatus } from './user-status.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UsersRepository)
    private usersRepository: UsersRepository,
  ) {}

  /**
   * Get a paginated user list
   * @param pagination {PaginationRequest}
   * @returns {Promise<PaginationResponseDto<UserResponseDto>>}
   */
  public async getUsers(
    pagination: PaginationRequest,
  ): Promise<PaginationResponseDto<UserResponseDto>> {
    try {
      // Logger.log(JSON.stringify(pagination));
      const [userEntities, totalUsers] =
        await this.usersRepository.getUsersAndCount(pagination);

      // Logger.log(totalUsers, userEntities, pagination);
      if (!userEntities?.length || totalUsers === 0) {
        throw new NotFoundException();
      }
      const UserDtos = await Promise.all(
        userEntities.map(UserMapper.toDtoWithRelations),
      );
      return Pagination.of(pagination, totalUsers, UserDtos);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException();
      }
      if (error instanceof TimeoutError) {
        throw new RequestTimeoutException();
      } else {
        throw new InternalServerErrorException();
      }
    }
  }

  /**
   * Get user by id
   * @param id {string}
   * @returns {Promise<UserResponseDto>}
   */
  public async getUserById(id: string): Promise<UserResponseDto> {
    const userEntity = await this.usersRepository.findOne(id, {
      relations: ['permissions', 'roles'],
    });
    if (!userEntity) {
      throw new NotFoundException();
    }

    return UserMapper.toDtoWithRelations(userEntity);
  }

  /**
   * Create new user
   * @param userDto {CreateUserRequestDto}
   * @returns {Promise<UserResponseDto>}
   */
  public async createUser(
    userDto: CreateUserRequestDto,
  ): Promise<UserResponseDto> {
    try {
      let userEntity = UserMapper.toCreateEntity(userDto);
      userEntity.password = await HashHelper.encrypt(userEntity.password);
      userEntity = await this.usersRepository.save(userEntity);
      return UserMapper.toDto(userEntity);
    } catch (error) {
      if (error.code == DBErrorCode.PgUniqueConstraintViolation) {
        throw new UserExistsException(userDto.username);
      }
      if (
        error.code == DBErrorCode.PgForeignKeyConstraintViolation ||
        error.code == DBErrorCode.PgNotNullConstraintViolation
      ) {
        throw new ForeignKeyConflictException();
      }
      if (error instanceof TimeoutError) {
        throw new RequestTimeoutException();
      } else {
        throw new InternalServerErrorException();
      }
    }
  }

  /**
   * Create new user
   * @param userDto {CreateUserRequestDto}
   * @returns {Promise<UserResponseDto>}
   */
  public async createUserBase(
    userDto: CreateUserBaseRequestDto,
  ): Promise<UserResponseDto> {
    try {
      let userEntity = UserMapper.toCreateSimpleEntity(userDto);
      userEntity.password = await HashHelper.encrypt(userEntity.password);
      userEntity = await this.usersRepository.save(userEntity);
      return UserMapper.toDto(userEntity);
    } catch (error) {
      if (error.code == DBErrorCode.PgUniqueConstraintViolation) {
        throw new UserExistsException(userDto.username);
      }
      if (
        error.code == DBErrorCode.PgForeignKeyConstraintViolation ||
        error.code == DBErrorCode.PgNotNullConstraintViolation
      ) {
        Logger.error(error);
        throw new ForeignKeyConflictException();
      }
      if (error instanceof TimeoutError) {
        throw new RequestTimeoutException();
      } else {
        throw new InternalServerErrorException();
      }
    }
  }

  /**
   * Update User by id
   * @param id {string}
   * @param userDto {Partial<UpdateUserRequestDto>}
   * @returns {Promise<UserResponseDto>}
   */
  public async updateUser(
    id: string,
    userDto: Partial<UpdateUserRequestDto>,
  ): Promise<UserResponseDto> {
    let userEntity = await this.usersRepository.findOne(id);
    if (!userEntity) {
      throw new NotFoundException();
    }

    try {
      userEntity = UserMapper.toUpdateEntity(userEntity, userDto);
      userEntity = await this.usersRepository.save(userEntity);
      return UserMapper.toDto(userEntity);
    } catch (error) {
      if (error.code == DBErrorCode.PgUniqueConstraintViolation) {
        throw new UserExistsException(userDto.username);
      }
      if (
        error.code == DBErrorCode.PgForeignKeyConstraintViolation ||
        error.code == DBErrorCode.PgNotNullConstraintViolation
      ) {
        throw new ForeignKeyConflictException();
      }
      if (error instanceof TimeoutError) {
        throw new RequestTimeoutException();
      } else {
        throw new InternalServerErrorException();
      }
    }
  }

  /**
   * Change user password
   * @param changePassword {ChangePasswordRequestDto}
   * @param user {string}
   * @returns {Promise<UserResponseDto>}
   */
  public async changePassword(
    changePassword: ChangePasswordRequestDto,
    userId: string,
  ): Promise<UserResponseDto> {
    const { currentPassword, newPassword } = changePassword;

    const userEntity = await this.usersRepository.findOne({ id: userId });

    if (!userEntity) {
      throw new NotFoundException();
    }

    const passwordMatch = await HashHelper.compare(
      currentPassword,
      userEntity.password,
    );

    if (!passwordMatch) {
      throw new InvalidCurrentPasswordException();
    }

    try {
      userEntity.password = await HashHelper.encrypt(newPassword);
      await this.usersRepository.save(userEntity);
      return UserMapper.toDto(userEntity);
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new RequestTimeoutException();
      } else {
        throw new InternalServerErrorException();
      }
    }
  }

  public async blockUser(id: string) {
    const userEntity = await this.usersRepository.findOne(id);
    userEntity.status = UserStatus.Blocked;
    try {
      await this.usersRepository.save(userEntity);
      return UserMapper.toDto(userEntity);
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new RequestTimeoutException();
      } else {
        throw new InternalServerErrorException();
      }
    }
  }
}
