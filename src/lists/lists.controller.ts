import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ListsService } from './lists.service';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { ProtectGard } from 'src/users/guards/Protect.guard';
import { GetCurrentUser } from 'src/users/decorators/current-user.decorator';
import { User } from 'src/users/entity/User.entity';
import { RestrictToGuard } from 'src/users/guards/RestrictTo.guard';
import { Roles } from 'src/users/decorators/userRole.decorator';
import { userType } from 'src/utils/enum';
import { AddWordToListDto } from './dto/AddWordToList.Dto';

@Controller()
export class ListsController {
  constructor(private readonly listsService: ListsService) { }

  @UseGuards(ProtectGard)
  @Post('/api/v1/lists')
  create(@Body() createListDto: CreateListDto, @GetCurrentUser() user: User) {
    return this.listsService.create(createListDto, user);
  }

  
  @UseGuards(ProtectGard)
  @Post('/api/v1/lists/:listId/vocabulary')
  AddWordToList(@Param('listId',ParseIntPipe) listId:number, @Body() dto: AddWordToListDto, @GetCurrentUser() user: User) {
  return this.listsService.AddWordToList(dto, listId, user)
  }

  @UseGuards(ProtectGard)
  @Delete('/api/v1/lists/:listId/vocabulary/:vocabId')
  RemoveWordFromList(
    @Param('listid', ParseIntPipe) listId: number,
    @Param('vocabId',ParseIntPipe) vocabId:number,
    @GetCurrentUser() user: User) {
    return this.listsService.RemoveWordFromList(listId, vocabId, user);
  }

  @Get('/api/v1/lists')
  @UseGuards(ProtectGard)
  findAll(@GetCurrentUser() user: User) {
    if(user.role === userType.NORMAL_USER || user.role === userType.SUBSCRIPED_USER)
      return this.listsService.findAllForCurrentUser(user);
    return this.listsService.findAllForAdmin();
  }

  // @Get('/api/v1/admin/lists')
  // @Roles(userType.ADMIN)
  // @UseGuards(ProtectGard, RestrictToGuard)
  // findAllForAdmin(@GetCurrentUser() user: User) {
  //   return this.listsService.findAllForAdmin();
  // }
  @UseGuards(ProtectGard)
  @Get('/api/v1/lists/:listId')
  findOne(@Param('listId', ParseIntPipe) listId: number, @GetCurrentUser() user: User) {
    return this.listsService.findOne(+listId, user);
  }
  @UseGuards(ProtectGard)
  @Patch('/api/v1/lists/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateListDto: UpdateListDto, @GetCurrentUser() user: User) {
    return this.listsService.update(+id, updateListDto, user);
  }
  @UseGuards(ProtectGard)
  @Delete('/api/v1/lists/:id')
  remove(@Param('id', ParseIntPipe) id: number, @GetCurrentUser() user: User) {
    return this.listsService.remove(+id, user);
  }
}
